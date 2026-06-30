-- 아띠제 주문표 Supabase 스키마
-- Supabase SQL Editor에서 실행하세요.

-- config 테이블 (팀원/옵션 목록 + 주문 마감 상태를 단일 행으로 관리)
create table if not exists config (
  id integer primary key default 1,
  users text[] not null default '{}',
  options text[] not null default '{"연하게","덜달게","디카페인","더달게","두유","오트밀크"}',
  orders_closed boolean not null default false,
  constraint config_singleton check (id = 1)
);
insert into config (id) values (1) on conflict do nothing;

-- drinks 테이블 (가격은 Tall / Grande 2종)
create table if not exists drinks (
  category text not null,
  name text not null,
  tall_price integer not null default 0,
  grande_price integer not null default 0,
  ice_only boolean not null default false,
  sort_order integer not null default 0,
  primary key (category, name)
);

-- orders 테이블
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  menu_name text not null,
  category text not null default 'others',
  requester text not null,
  size text not null check (size in ('Tall', 'Grande')),
  temp text not null default 'ICE' check (temp in ('ICE', 'HOT')),
  options text[] not null default '{}',
  note text not null default '',
  unit_price integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Realtime 활성화
alter publication supabase_realtime add table config;
alter publication supabase_realtime add table drinks;
alter publication supabase_realtime add table orders;

-- RLS 정책 (내부 도구용 - anon key로 전체 허용)
alter table config enable row level security;
alter table drinks enable row level security;
alter table orders enable row level security;

create policy "allow all config" on config for all using (true) with check (true);
create policy "allow all drinks" on drinks for all using (true) with check (true);
create policy "allow all orders" on orders for all using (true) with check (true);
