<!-- Login Page -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Victory Vision - Login</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #212e53; }
    .header-logo { text-align: center; padding: 20px; }
    .header-logo img { max-width: 150px; }
    .form-container { background: #fff; max-width: 400px; padding: 20px; margin: 60px auto; border-radius: 5px; }
    .form-container h1 { text-align: center; margin-bottom: 1em; }
    .form-container label { display: block; margin-bottom: 0.5em; color: #333; }
    .form-container input { width: 100%; padding: 8px; margin-top: 4px; margin-bottom: 1em; }
    .form-container button { width: 100%; padding: 10px; background: #212e53; color: #fff; border: none; border-radius: 5px; cursor: pointer; }
    .form-container button:hover { opacity: 0.9; }
    .form-container .actions { text-align: center; margin-top: 1em; }
    .form-container .actions a { color: #212e53; text-decoration: none; margin: 0 10px; }
    .form-container .actions a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <!-- Victory Vision logo centered at top -->
  <div class="header-logo">
    <img src="logo.png" alt="Victory Vision Logo">
  </div>
  <div class="form-container">
    <h1>Login</h1>
    <form>
      <label for="login-email">Email:
        <input type="email" id="login-email" name="email" placeholder="Email">
      </label>
      <label for="login-password">Password:
        <input type="password" id="login-password" name="password" placeholder="Password">
      </label>
      <label style="display: flex; align-items: center; font-size: 0.9em;"><input type="checkbox" name="remember" style="margin-right: 5px;"> Remember me</label>
      <button type="submit">Login</button>
    </form>
    <div class="actions">
      <a href="forgot-password.html">Forgot Password?</a> | <a href="signup.html">Sign Up</a>
    </div>
  </div>
</body>
</html>
