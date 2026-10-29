-- 기본 요청사항은 맛 조절(연하게·덜달게·더달게)만 남긴다.
-- 디카페인·두유·오트밀크·저지방우유는 메뉴별 유료 옵션(drinks.extras)으로 옮겨 갔다.
UPDATE config
SET options = (
  SELECT json_group_array(value) FROM json_each(config.options)
  WHERE value IN ('연하게', '덜달게', '더달게')
)
WHERE id = 1;
