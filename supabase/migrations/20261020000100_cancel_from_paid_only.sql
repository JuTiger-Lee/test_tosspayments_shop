-- 취소는 결제 완료(paid) 주문에서만 시작한다.
-- 동시에 두 번 누르면 두 번째 요청은 canceling 상태라 막히고, 토스 취소가 두 번 호출되지 않는다.
create or replace function public.begin_cancel(p_order_id text, p_user_id uuid)
returns table (payment_key text, amount integer)
language sql security definer set search_path = '' as $$
  update public.orders set status = 'canceling'
   where id = p_order_id and user_id = p_user_id
     and status = 'paid'
     and approved_at > now() - interval '7 days'
  returning payment_key, amount;
$$;
