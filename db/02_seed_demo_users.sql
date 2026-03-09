-- Demo users (for local dev ONLY)
-- Password hashes are bcrypt of:
-- AdminPassword123 / PmPassword123 / AdvisorPassword123 / DonorPassword123

INSERT INTO auth_user (user_id, email, full_name, password_hash)
VALUES
  ('76fe8ab5-1c98-403c-95b9-00fe8885e8d8', 'admin@example.com',  'Admin User',  '$2b$12$pCMtyA5fM0F60HGxheS8MOXyvvrdokVxcmzbrA1H001NSciUNpL2a'),
  ('a5e1a3c8-d119-49c3-94fd-29238b4a419e', 'pm@example.com',     'PM User',     '$2b$12$DRjt90.WEihYeAdIEpc98O9wkrxWdonFf7LoPUcM/c8RYo.yfqXte'),
  ('b2f2c8c1-2a41-4f24-a91e-2a1f7c2f3c11', 'advisor@example.com','Advisor User','$2b$12$KkVBcU6BNcOGAMiqV0NoZe2didNAZAxBn6Jq1HRjyD8XJY.8/9pbK'),
  ('c3f3c8c1-2a41-4f24-a91e-2a1f7c2f3c22', 'donor@example.com',  'Donor User',  '$2b$12$k4y7nxRsokd3NB2CthdxHO.pPw8PTo3BnKJ8idapPxcrhpnfq9lc.')
ON CONFLICT (email) DO NOTHING;


-- Roles mapping (role_key must already exist in auth_role)
INSERT INTO auth_user_role (user_id, role_key)
VALUES
  ('76fe8ab5-1c98-403c-95b9-00fe8885e8d8','admin'),
  ('a5e1a3c8-d119-49c3-94fd-29238b4a419e','program_manager'),
  ('b2f2c8c1-2a41-4f24-a91e-2a1f7c2f3c11','advisor'),
  ('c3f3c8c1-2a41-4f24-a91e-2a1f7c2f3c22','donor')
ON CONFLICT DO NOTHING;

-- Scopes (Program Manager -> RW)
INSERT INTO auth_scope (user_id, country_code)
VALUES ('a5e1a3c8-d119-49c3-94fd-29238b4a419e','RW')
ON CONFLICT DO NOTHING;