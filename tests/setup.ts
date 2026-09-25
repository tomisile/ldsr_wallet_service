process.env.NODE_ENV = 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test_secret_that_is_at_least_thirty_two_chars';
