/*
  응모 저장용 공개 설정입니다.
  이 키는 Supabase의 publishable/anon 클라이언트 키로, GitHub에 공개해도 되는 키입니다.
  실제 응모 데이터는 RLS가 적용된 entries 테이블에 저장되며 공개 조회는 차단되어 있습니다.
*/
window.SAWLIB_CONFIG = {
  supabaseUrl: "https://sagnvbfofzlazhflvktu.supabase.co",
  supabaseKey: "sb_publishable_rcXqEkRoN5coPDm1rhEuOg_2TBI1hVy"
};
