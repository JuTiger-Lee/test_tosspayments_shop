-- STYLEHAUS 쇼핑몰 스키마 (PRD.md 기준)
--
-- 쓰기 권한 원칙
--   - 상품·재고·주문·결제: 서버(api/)가 service role 키로만 쓴다. 운영자는 Supabase 관리 화면에서 직접 수정한다.
--   - 브라우저(anon/authenticated): 상품 조회, 자기 주문 조회, 자기 리뷰·좋아요 쓰기만 RLS로 허용한다.
--
-- 주문 상태(orders.status)
--   pending   결제 대기        approving 승인 처리 중(재고 차감 후 토스 승인 호출 중)
--   paid      결제 완료        failed    결제 실패
--   canceling 취소 처리 중     canceled  취소 완료
-- 고객 화면에는 pending/failed가 보이지 않고, approving·canceling은 몇 초간만 거치는 내부 상태다.

-- ---------------------------------------------------------------
-- 상품·재고
-- ---------------------------------------------------------------
create table public.products (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  category text not null check (category in ('tops', 'shoes', 'pants')),
  sub text not null,
  img text not null,
  brand text not null,
  name text not null,
  price integer not null check (price >= 0),
  discount integer not null default 0 check (discount between 0 and 99),
  badge text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  -- 아래 세 값은 좋아요·리뷰 트리거가 자동으로 맞춘다
  like_count integer not null default 0,
  review_count integer not null default 0,
  rating_sum integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.products.is_active is 'false = 판매 중지(목록에서 숨김, 지난 주문은 유지)';
comment on column public.products.discount is '할인율(%). 판매가는 정가×(100-할인율)/100을 100원 단위로 반올림';

create table public.product_stock (
  product_id text not null references public.products (id) on delete cascade,
  size text not null,
  stock integer not null default 0 check (stock >= 0),
  sort_order integer not null default 0,
  primary key (product_id, size)
);
comment on table public.product_stock is '상품×사이즈별 재고. 0이면 품절';

-- ---------------------------------------------------------------
-- 회원
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 주문·결제
-- ---------------------------------------------------------------
create table public.orders (
  id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approving', 'paid', 'failed', 'canceling', 'canceled')),
  order_name text not null,
  items_total integer not null check (items_total >= 0),
  shipping integer not null check (shipping >= 0),
  amount integer not null check (amount > 0),
  payment_key text unique,
  method text,
  receipt_url text,
  approved_at timestamptz,
  canceled_at timestamptz,
  fail_code text,
  fail_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_id_created_at_idx on public.orders (user_id, created_at desc);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (id) on delete cascade,
  product_id text not null references public.products (id),
  size text not null,
  qty integer not null check (qty between 1 and 10),
  -- 결제 당시 정보(가격 스냅샷). 상품이 나중에 바뀌어도 그대로 남는다
  unit_price integer not null check (unit_price >= 0),
  product_name text not null,
  brand text not null,
  img text not null
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- 토스페이먼츠와 주고받은 결과 기록(승인·취소·실패 모두)
create table public.payments (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('confirm', 'cancel', 'fail')),
  success boolean not null,
  payment_key text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index payments_order_id_idx on public.payments (order_id);

-- ---------------------------------------------------------------
-- 리뷰·좋아요
-- ---------------------------------------------------------------
create table public.reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  size text not null,
  rating smallint not null check (rating between 1 and 5),
  content text not null check (char_length(content) between 10 and 500),
  author_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index reviews_product_id_created_at_idx on public.reviews (product_id, created_at desc);

create table public.likes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index likes_product_id_idx on public.likes (product_id);

-- ---------------------------------------------------------------
-- 트리거
-- ---------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

-- 가입 시 프로필 생성 (이메일 가입은 name, 카카오는 name/nickname 등 메타데이터 사용)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    left(coalesce(
      nullif(trim(meta ->> 'name'), ''),
      nullif(trim(meta ->> 'full_name'), ''),
      nullif(trim(meta ->> 'nickname'), ''),
      nullif(trim(meta ->> 'user_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '회원'
    ), 30)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 리뷰 작성자 이름은 "김**"처럼 첫 글자만 남겨 저장한다(전체 이름이 공개되지 않게)
create function public.reviews_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  full_name text;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id := auth.uid();
    end if;
    select p.name into full_name from public.profiles p where p.id = new.user_id;
    new.author_name := coalesce(left(nullif(full_name, ''), 1), '회') || '**';
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger reviews_before_write before insert on public.reviews
  for each row execute function public.reviews_before_write();

-- 상품의 리뷰 수·별점 합계 갱신
create function public.reviews_sync_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.products
       set review_count = review_count - 1, rating_sum = rating_sum - old.rating
     where id = old.product_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.products
       set review_count = review_count + 1, rating_sum = rating_sum + new.rating
     where id = new.product_id;
  end if;
  return null;
end;
$$;

create trigger reviews_sync_stats after insert or update or delete on public.reviews
  for each row execute function public.reviews_sync_stats();

-- 상품의 좋아요 수 갱신
create function public.likes_sync_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.products set like_count = like_count + 1 where id = new.product_id;
  else
    update public.products set like_count = greatest(like_count - 1, 0) where id = old.product_id;
  end if;
  return null;
end;
$$;

create trigger likes_sync_stats after insert or delete on public.likes
  for each row execute function public.likes_sync_stats();

-- ---------------------------------------------------------------
-- 서버 전용 함수 (service role만 실행)
-- ---------------------------------------------------------------

-- 주문 + 주문 상품을 한 번에 저장
create function public.create_order(
  p_order_id text, p_user_id uuid, p_order_name text,
  p_items_total integer, p_shipping integer, p_amount integer, p_items jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.orders (id, user_id, order_name, items_total, shipping, amount)
  values (p_order_id, p_user_id, p_order_name, p_items_total, p_shipping, p_amount);

  insert into public.order_items (order_id, product_id, size, qty, unit_price, product_name, brand, img)
  select p_order_id, i.product_id, i.size, i.qty, i.unit_price, i.product_name, i.brand, i.img
    from jsonb_to_recordset(p_items)
      as i(product_id text, size text, qty integer, unit_price integer, product_name text, brand text, img text);
end;
$$;

-- 결제 대기 → 승인 처리 중으로 바꾸며 재고를 원자적으로 차감한다.
-- 재고가 모자라면 아무것도 차감하지 않고 주문을 결제 실패(SOLD_OUT)로 만든다.
create function public.begin_approval(p_order_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  sold jsonb := '[]'::jsonb;
begin
  update public.orders set status = 'approving' where id = p_order_id and status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_PENDING');
  end if;

  begin
    -- 여러 주문이 동시에 들어와도 교착되지 않도록 항상 같은 순서로 잠근다
    for r in
      select product_id, size, sum(qty)::integer as qty, min(product_name) as product_name
        from public.order_items where order_id = p_order_id
       group by product_id, size order by product_id, size
    loop
      update public.product_stock set stock = stock - r.qty
       where product_id = r.product_id and size = r.size and stock >= r.qty;
      if not found then
        sold := sold || jsonb_build_object('id', r.product_id, 'size', r.size, 'name', r.product_name);
      end if;
    end loop;
    if jsonb_array_length(sold) > 0 then
      raise exception 'SOLD_OUT';
    end if;
  exception when raise_exception then
    -- 위 블록에서 차감한 재고는 모두 되돌려진다
    update public.orders
       set status = 'failed', fail_code = 'SOLD_OUT', fail_message = '품절되어 결제할 수 없습니다.'
     where id = p_order_id;
    return jsonb_build_object('ok', false, 'reason', 'SOLD_OUT', 'items', sold);
  end;

  return jsonb_build_object('ok', true);
end;
$$;

-- 재고 되돌리기(승인 실패·취소 완료 때 사용)
create function public.restore_stock(p_order_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select product_id, size, sum(qty)::integer as qty
      from public.order_items where order_id = p_order_id
     group by product_id, size order by product_id, size
  loop
    update public.product_stock set stock = stock + r.qty
     where product_id = r.product_id and size = r.size;
  end loop;
end;
$$;

-- 토스 승인 성공 → 결제 완료
create function public.finish_approval(
  p_order_id text, p_payment_key text, p_method text, p_receipt_url text, p_approved_at timestamptz, p_raw jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders
     set status = 'paid', payment_key = p_payment_key, method = p_method,
         receipt_url = p_receipt_url, approved_at = p_approved_at
   where id = p_order_id and status = 'approving';
  if not found then
    return false;
  end if;
  insert into public.payments (order_id, kind, success, payment_key, raw)
  values (p_order_id, 'confirm', true, p_payment_key, p_raw);
  return true;
end;
$$;

-- 토스 승인 실패 → 재고 복구 후 결제 실패
create function public.abort_approval(
  p_order_id text, p_payment_key text, p_code text, p_message text, p_raw jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders
     set status = 'failed', fail_code = left(p_code, 100), fail_message = left(p_message, 300)
   where id = p_order_id and status = 'approving';
  if not found then
    return false;
  end if;
  perform public.restore_stock(p_order_id);
  insert into public.payments (order_id, kind, success, payment_key, raw)
  values (p_order_id, 'confirm', false, p_payment_key, p_raw);
  return true;
end;
$$;

-- 결제창에서 실패·중단 → 결제 실패 (결제 대기 상태일 때만)
create function public.mark_failed(p_order_id text, p_code text, p_message text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders
     set status = 'failed', fail_code = left(p_code, 100), fail_message = left(p_message, 300)
   where id = p_order_id and status = 'pending';
  if not found then
    return false;
  end if;
  insert into public.payments (order_id, kind, success, raw)
  values (p_order_id, 'fail', false, jsonb_build_object('code', p_code, 'message', p_message));
  return true;
end;
$$;

-- 취소 시작: 본인 주문 + 결제 완료 + 결제 후 7일 이내만.
-- 처리 중(canceling)인 주문도 다시 받는다: 토스 취소는 멱등키로 중복 처리되지 않는다.
create function public.begin_cancel(p_order_id text, p_user_id uuid)
returns table (payment_key text, amount integer)
language sql security definer set search_path = '' as $$
  update public.orders set status = 'canceling'
   where id = p_order_id and user_id = p_user_id
     and status in ('paid', 'canceling')
     and approved_at > now() - interval '7 days'
  returning payment_key, amount;
$$;

-- 토스 취소 성공 → 취소 완료 + 재고 복구
create function public.finish_cancel(p_order_id text, p_raw jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set status = 'canceled', canceled_at = now()
   where id = p_order_id and status = 'canceling';
  if not found then
    return false;
  end if;
  perform public.restore_stock(p_order_id);
  insert into public.payments (order_id, kind, success, payment_key, raw)
  values (p_order_id, 'cancel', true, p_raw ->> 'paymentKey', p_raw);
  return true;
end;
$$;

-- 토스 취소 실패 → 결제 완료로 되돌림
create function public.abort_cancel(p_order_id text, p_raw jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  reverted boolean;
begin
  update public.orders set status = 'paid' where id = p_order_id and status = 'canceling';
  reverted := found;
  insert into public.payments (order_id, kind, success, raw) values (p_order_id, 'cancel', false, p_raw);
  return reverted;
end;
$$;

-- ---------------------------------------------------------------
-- 권한 (RLS + 컬럼 단위 GRANT)
-- ---------------------------------------------------------------
alter table public.products enable row level security;
alter table public.product_stock enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.likes enable row level security;

revoke all on public.products, public.product_stock, public.profiles, public.orders,
  public.order_items, public.payments, public.reviews, public.likes from anon, authenticated;

grant select on public.products, public.product_stock to anon, authenticated;
grant select, update (name) on public.profiles to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (product_id, size, rating, content), update (rating, content), delete on public.reviews to authenticated;
grant select, insert (product_id), delete on public.likes to authenticated;

create policy "판매 중인 상품은 누구나 조회" on public.products
  for select to anon, authenticated using (is_active);

create policy "재고는 누구나 조회" on public.product_stock
  for select to anon, authenticated using (true);

create policy "내 프로필 조회" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "내 프로필 수정" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "내 주문 조회(결제 완료·취소)" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) and status in ('paid', 'canceling', 'canceled'));

create policy "내 주문 상품 조회" on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_items.order_id and o.user_id = (select auth.uid())
       and o.status in ('paid', 'canceling', 'canceled')
  ));

create policy "리뷰는 누구나 조회" on public.reviews
  for select to anon, authenticated using (true);
create policy "결제 완료한 상품·사이즈만 리뷰 작성" on public.reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.order_items i join public.orders o on o.id = i.order_id
       where o.user_id = (select auth.uid()) and o.status = 'paid'
         and i.product_id = reviews.product_id and i.size = reviews.size
    )
  );
create policy "내 리뷰 수정" on public.reviews
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "내 리뷰 삭제" on public.reviews
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "내 좋아요 조회" on public.likes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "내 좋아요 추가" on public.likes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "내 좋아요 취소" on public.likes
  for delete to authenticated using (user_id = (select auth.uid()));

-- 함수 실행 권한: 트리거 함수와 서버 전용 함수는 브라우저에서 호출할 수 없게 막는다
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_order(text, uuid, text, integer, integer, integer, jsonb),
  public.begin_approval(text),
  public.restore_stock(text),
  public.finish_approval(text, text, text, text, timestamptz, jsonb),
  public.abort_approval(text, text, text, text, jsonb),
  public.mark_failed(text, text, text),
  public.begin_cancel(text, uuid),
  public.finish_cancel(text, jsonb),
  public.abort_cancel(text, jsonb)
to service_role;
