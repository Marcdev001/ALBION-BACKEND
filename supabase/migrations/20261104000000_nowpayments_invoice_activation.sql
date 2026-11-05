create table if not exists public.albion_nowpayments_invoices (
	order_id text primary key,
	invoice_id text,
	user_id uuid not null references auth.users (id) on delete cascade,
	plan_tier text not null check (plan_tier in ('learner', 'starter', 'pro')),
	expected_amount numeric(12, 2) not null check (expected_amount > 0),
	price_currency text not null default 'usd' check (lower(price_currency) = 'usd'),
	pay_currency text not null,
	status text not null default 'pending' check (status in ('pending', 'paid')),
	payment_id text unique,
	paid_at timestamptz,
	created_at timestamptz not null default now()
);

alter table public.albion_nowpayments_invoices enable row level security;
revoke all on public.albion_nowpayments_invoices from public, anon, authenticated;
grant select, insert, update on public.albion_nowpayments_invoices to service_role;

create or replace function public.albion_activate_nowpayment_invoice(
	p_order_id text,
	p_payment_id text,
	p_payment_status text,
	p_price_amount numeric,
	p_price_currency text,
	p_pay_currency text,
	p_model_balances jsonb,
	p_cycle_start timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	v_invoice public.albion_nowpayments_invoices%rowtype;
begin
	select * into v_invoice
	from public.albion_nowpayments_invoices
	where order_id = p_order_id
	for update;

	if not found then
		return jsonb_build_object('status', 'not_found');
	end if;

	if v_invoice.status = 'paid' then
		if v_invoice.payment_id = p_payment_id then
			return jsonb_build_object('status', 'already_processed');
		end if;
		return jsonb_build_object('status', 'conflict');
	end if;

	if lower(p_payment_status) <> 'finished'
		or p_price_amount is distinct from v_invoice.expected_amount
		or lower(coalesce(p_price_currency, '')) <> lower(v_invoice.price_currency)
		or lower(coalesce(p_pay_currency, '')) <> lower(v_invoice.pay_currency)
		or p_payment_id is null or p_payment_id = '' then
		return jsonb_build_object('status', 'payment_mismatch');
	end if;

	insert into public.subscriptions (user_id, tier, status, cycle_start, model_balances)
	values (v_invoice.user_id, v_invoice.plan_tier, 'active', p_cycle_start, p_model_balances)
	on conflict (user_id) do update set
		tier = excluded.tier,
		status = excluded.status,
		cycle_start = excluded.cycle_start,
		model_balances = excluded.model_balances;

	update public.albion_nowpayments_invoices
	set status = 'paid', payment_id = p_payment_id, paid_at = p_cycle_start
	where order_id = p_order_id;

	return jsonb_build_object('status', 'activated', 'user_id', v_invoice.user_id, 'plan_tier', v_invoice.plan_tier);
end;
$$;

revoke all on function public.albion_activate_nowpayment_invoice(text, text, text, numeric, text, text, jsonb, timestamptz) from public;
grant execute on function public.albion_activate_nowpayment_invoice(text, text, text, numeric, text, text, jsonb, timestamptz) to service_role;