<?php
declare(strict_types=1);

function auth_login(): void
{
    requireFields(['username', 'password']);
    $user = Auth::attempt(inStr('username'), inStr('password'));
    if (!$user) {
        usleep(400_000); // slow brute force a little
        fail('Wrong username or password.', 401);
    }
    audit('login', 'users', $user['id']);
    ok($user);
}

function auth_logout(): void
{
    audit('logout', 'users', Auth::id());
    Auth::logout();
    ok();
}

function auth_me(): void
{
    ok(Auth::user());
}
