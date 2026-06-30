-- 마이그레이션: venti_price → grande_price 컬럼명 정리 + 주문 마감(orders_closed) 상태 추가
-- 기존 Supabase 인스턴스에 1회 적용하세요. (Supabase SQL Editor에서 실행)
-- 신규 인스턴스는 schema.sql만 실행하면 됩니다.

-- 1) drinks.venti_price → grande_price 로 컬럼명 변경 (값은 Grande 가격이었음)
alter table drinks rename column venti_price to grande_price;

-- 2) config 에 주문 마감 상태 컬럼 추가
alter table config add column if not exists orders_closed boolean not null default false;

-- 3) config 단일 행 보장 (없으면 생성). 프론트의 .single() 조회가 0행이면 실패하므로 필수.
insert into config (id) values (1) on conflict do nothing;
