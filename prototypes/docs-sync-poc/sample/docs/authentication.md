---
title: Authentication
sources: [code/auth.ts]
---

# Authentication

Call `login(email, password)` to sign a user in. It resolves to a `{ token }`
on success, which you attach to subsequent requests.

```ts
const { token } = await login("a@b.com", "hunter2");
```

There is no second factor — email and password are all that's required.
