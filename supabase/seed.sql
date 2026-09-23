-- Local development / CI seed (runs after migrations on `supabase db reset`).
-- The hosted demo creates the same staff through the Auth Admin API instead
-- (scripts/demo-staff.mjs), so no password here is ever used outside localhost.
--
-- Local password for every account below: demo-local-password

do $$
declare
  v_staff record;
  v_id uuid;
begin
  for v_staff in
    select * from (values
      ('dragan', 'admin'),
      ('jelena', 'user'),
      ('marko',  'user'),
      ('ana',    'user'),
      ('nikola', 'user'),
      ('milica', 'user')
    ) as t(username, role)
  loop
    if exists (select 1 from auth.users where email = v_staff.username || '@gym.local') then
      continue;
    end if;

    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_staff.username || '@gym.local',
      extensions.crypt('demo-local-password', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('username', v_staff.username),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', v_staff.username || '@gym.local',
                         'email_verified', true),
      now(), now(), now()
    );

    -- handle_new_user() always provisions role 'user'; admins are promoted here.
    if v_staff.role = 'admin' then
      update public.staff set role = 'admin' where id = v_id;
    end if;
  end loop;
end $$;

select demo.reset();
