-- Atomic paid-tier reservations, scoped to the subscription billing cycle.
-- Apply with: supabase db push

create table if not exists public.albion_paid_quota_locks (
	user_id uuid not null references auth.users (id) on delete cascade,
	cycle_start timestamptz not null,
	created_at timestamptz not null default now(),
	primary key (user_id, cycle_start)
);

create table if not exists public.albion_paid_quota_reservations (
	request_id uuid primary key,
	user_id uuid not null references auth.users (id) on delete cascade,
	cycle_start timestamptz not null,
	tier text not null,
	model_id text not null,
	reserved_tokens bigint not null check (reserved_tokens >= 0),
	model_cap bigint not null check (model_cap > 0),
	total_cap bigint not null check (total_cap > 0),
	status text not null default 'reserved' check (status in ('reserved', 'uncertain', 'settled', 'released')),
	actual_tokens bigint,
	actual_cost numeric(16, 8),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists albion_paid_quota_reservations_pending_idx
	on public.albion_paid_quota_reservations (user_id, cycle_start, model_id, status)
	where status in ('reserved', 'uncertain');

alter table public.albion_paid_quota_locks enable row level security;
alter table public.albion_paid_quota_reservations enable row level security;
revoke all on public.albion_paid_quota_locks from public, anon, authenticated;
revoke all on public.albion_paid_quota_reservations from public, anon, authenticated;
grant select, insert, update on public.albion_paid_quota_locks to service_role;
grant select, insert, update on public.albion_paid_quota_reservations to service_role;

create or replace function public.albion_reserve_paid_tier_tokens(
	p_request_id uuid,
	p_user_id uuid,
	p_tier text,
	p_cycle_start timestamptz,
	p_model_id text,
	p_estimate bigint,
	p_model_cap bigint,
	p_total_cap bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	v_subscription_tier text;
	v_subscription_cycle timestamptz;
	v_estimate bigint := greatest(coalesce(p_estimate, 0), 0);
	v_model_cap bigint := greatest(coalesce(p_model_cap, 0), 0);
	v_total_cap bigint := greatest(coalesce(p_total_cap, 0), 0);
	v_total_used bigint;
	v_model_used bigint;
	v_total_reserved bigint;
	v_model_reserved bigint;
	v_existing public.albion_paid_quota_reservations%rowtype;
begin
	if p_request_id is null or p_user_id is null or p_model_id is null or v_model_cap = 0 or v_total_cap = 0 then
		return jsonb_build_object('allowed', false, 'status', 'invalid_request');
	end if;

	select tier, cycle_start
	into v_subscription_tier, v_subscription_cycle
	from public.subscriptions
	where user_id = p_user_id and status = 'active'
	for share;

	if not found or v_subscription_tier is distinct from p_tier or v_subscription_cycle is distinct from p_cycle_start then
		return jsonb_build_object('allowed', false, 'status', 'subscription_changed');
	end if;

	insert into public.albion_paid_quota_locks (user_id, cycle_start)
	values (p_user_id, p_cycle_start)
	on conflict (user_id, cycle_start) do nothing;

	perform 1
	from public.albion_paid_quota_locks
	where user_id = p_user_id and cycle_start = p_cycle_start
	for update;

	select * into v_existing
	from public.albion_paid_quota_reservations
	where request_id = p_request_id
	for update;

	if found then
		if v_existing.user_id <> p_user_id or v_existing.model_id <> p_model_id or v_existing.reserved_tokens <> v_estimate then
			return jsonb_build_object('allowed', false, 'status', 'request_id_conflict');
		end if;
		return jsonb_build_object('allowed', v_existing.status in ('reserved', 'uncertain'), 'status', v_existing.status, 'reserved', v_existing.reserved_tokens);
	end if;

	select coalesce(sum(greatest(prompt_tokens, 0) + greatest(completion_tokens, 0)), 0)
	into v_total_used
	from public.usage_logs
	where user_id = p_user_id and timestamp >= p_cycle_start;

	select coalesce(sum(greatest(prompt_tokens, 0) + greatest(completion_tokens, 0)), 0)
	into v_model_used
	from public.usage_logs
	where user_id = p_user_id and timestamp >= p_cycle_start and model = p_model_id;

	select coalesce(sum(reserved_tokens), 0)
	into v_total_reserved
	from public.albion_paid_quota_reservations
	where user_id = p_user_id and cycle_start = p_cycle_start and status in ('reserved', 'uncertain');

	select coalesce(sum(reserved_tokens), 0)
	into v_model_reserved
	from public.albion_paid_quota_reservations
	where user_id = p_user_id and cycle_start = p_cycle_start and model_id = p_model_id and status in ('reserved', 'uncertain');

	if v_total_used + v_total_reserved + v_estimate > v_total_cap then
		return jsonb_build_object('allowed', false, 'status', 'total_cap_exceeded', 'used', v_total_used, 'reserved', v_total_reserved, 'remaining', greatest(v_total_cap - v_total_used - v_total_reserved, 0));
	end if;

	if v_model_used + v_model_reserved + v_estimate > v_model_cap then
		return jsonb_build_object('allowed', false, 'status', 'model_cap_exceeded', 'used', v_model_used, 'reserved', v_model_reserved, 'remaining', greatest(v_model_cap - v_model_used - v_model_reserved, 0));
	end if;

	insert into public.albion_paid_quota_reservations (
		request_id, user_id, cycle_start, tier, model_id, reserved_tokens, model_cap, total_cap
	) values (
		p_request_id, p_user_id, p_cycle_start, p_tier, p_model_id, v_estimate, v_model_cap, v_total_cap
	);

	return jsonb_build_object('allowed', true, 'status', 'reserved', 'reserved', v_estimate, 'used', v_total_used, 'remaining', greatest(v_total_cap - v_total_used - v_total_reserved - v_estimate, 0));
end;
$$;

create or replace function public.albion_settle_paid_tier_tokens(
	p_request_id uuid,
	p_prompt_tokens bigint,
	p_completion_tokens bigint,
	p_actual_cost numeric,
	p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	v_reservation public.albion_paid_quota_reservations%rowtype;
	v_user_id uuid;
	v_cycle_start timestamptz;
	v_prompt bigint := greatest(coalesce(p_prompt_tokens, 0), 0);
	v_completion bigint := greatest(coalesce(p_completion_tokens, 0), 0);
	v_actual bigint;
	v_total_used bigint;
begin
	select user_id, cycle_start
	into v_user_id, v_cycle_start
	from public.albion_paid_quota_reservations
	where request_id = p_request_id;
	if not found then return jsonb_build_object('status', 'not_found'); end if;

	insert into public.albion_paid_quota_locks (user_id, cycle_start)
	values (v_user_id, v_cycle_start)
	on conflict (user_id, cycle_start) do nothing;
	perform 1 from public.albion_paid_quota_locks
	where user_id = v_user_id and cycle_start = v_cycle_start
	for update;

	select * into v_reservation
	from public.albion_paid_quota_reservations
	where request_id = p_request_id
	for update;
	if not found then return jsonb_build_object('status', 'not_found'); end if;
	if v_reservation.status = 'settled' then
		return jsonb_build_object('status', 'already_settled', 'actual_tokens', v_reservation.actual_tokens);
	end if;
	if v_reservation.status not in ('reserved', 'uncertain') then return jsonb_build_object('status', v_reservation.status); end if;

	v_actual := v_prompt + v_completion;
	insert into public.usage_logs (user_id, model, prompt_tokens, completion_tokens, actual_cost, session_id, timestamp)
	values (v_reservation.user_id, v_reservation.model_id, v_prompt, v_completion, greatest(coalesce(p_actual_cost, 0), 0), p_session_id, v_reservation.created_at);

	update public.albion_paid_quota_reservations
	set status = 'settled', actual_tokens = v_actual, actual_cost = greatest(coalesce(p_actual_cost, 0), 0), updated_at = now()
	where request_id = p_request_id;

	select coalesce(sum(greatest(prompt_tokens, 0) + greatest(completion_tokens, 0)), 0)
	into v_total_used
	from public.usage_logs
	where user_id = v_reservation.user_id and timestamp >= v_reservation.cycle_start;

	return jsonb_build_object('status', 'settled', 'actual_tokens', v_actual, 'over_reserved', v_actual > v_reservation.reserved_tokens, 'over_total_cap', v_total_used > v_reservation.total_cap);
end;
$$;

create or replace function public.albion_release_paid_tier_tokens(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	v_reservation public.albion_paid_quota_reservations%rowtype;
begin
	select * into v_reservation
	from public.albion_paid_quota_reservations
	where request_id = p_request_id
	for update;
	if not found then return jsonb_build_object('status', 'not_found'); end if;
	if v_reservation.status = 'released' then return jsonb_build_object('status', 'already_released'); end if;
	if v_reservation.status <> 'reserved' then return jsonb_build_object('status', v_reservation.status); end if;
	update public.albion_paid_quota_reservations set status = 'released', updated_at = now() where request_id = p_request_id;
	return jsonb_build_object('status', 'released');
end;
$$;

create or replace function public.albion_mark_paid_tier_tokens_uncertain(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	v_status text;
begin
	update public.albion_paid_quota_reservations
	set status = 'uncertain', updated_at = now()
	where request_id = p_request_id and status in ('reserved', 'uncertain')
	returning status into v_status;
	if not found then return jsonb_build_object('status', 'not_found_or_finalized'); end if;
	return jsonb_build_object('status', v_status);
end;
$$;

revoke all on function public.albion_reserve_paid_tier_tokens(uuid, uuid, text, timestamptz, text, bigint, bigint, bigint) from public;
revoke all on function public.albion_settle_paid_tier_tokens(uuid, bigint, bigint, numeric, text) from public;
revoke all on function public.albion_release_paid_tier_tokens(uuid) from public;
revoke all on function public.albion_mark_paid_tier_tokens_uncertain(uuid) from public;
grant execute on function public.albion_reserve_paid_tier_tokens(uuid, uuid, text, timestamptz, text, bigint, bigint, bigint) to service_role;
grant execute on function public.albion_settle_paid_tier_tokens(uuid, bigint, bigint, numeric, text) to service_role;
grant execute on function public.albion_release_paid_tier_tokens(uuid) to service_role;
grant execute on function public.albion_mark_paid_tier_tokens_uncertain(uuid) to service_role;