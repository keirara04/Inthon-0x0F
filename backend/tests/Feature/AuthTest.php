<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_registers_a_nickname_account_and_returns_a_token(): void
    {
        $res = $this->postJson('/api/auth/register', [
            'nickname' => '길찾기왕',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])->assertCreated();

        $this->assertSame('길찾기왕', $res->json('data.user.nickname'));
        $this->assertSame('길찾기왕', $res->json('data.user.name'));
        $this->assertNotEmpty($res->json('data.token'));
        $this->assertNull($res->json('data.user.password'));
        $this->assertDatabaseHas('users', ['nickname' => '길찾기왕', 'email' => null]);
    }

    public function test_rejects_a_nickname_that_is_already_taken(): void
    {
        User::factory()->create(['nickname' => '길찾기왕']);

        $this->postJson('/api/auth/register', [
            'nickname' => '길찾기왕',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])->assertUnprocessable()->assertJsonValidationErrors('nickname');
    }

    public function test_rejects_a_mismatched_password_confirmation(): void
    {
        $this->postJson('/api/auth/register', [
            'nickname' => '길찾기왕',
            'password' => 'secret123',
            'password_confirmation' => 'different',
        ])->assertUnprocessable()->assertJsonValidationErrors('password');
    }

    public function test_logs_in_with_nickname_and_password(): void
    {
        User::factory()->create(['nickname' => '길찾기왕', 'password' => 'secret123']);

        $res = $this->postJson('/api/auth/login', [
            'nickname' => '길찾기왕',
            'password' => 'secret123',
        ])->assertOk();

        $this->assertSame('길찾기왕', $res->json('data.user.nickname'));
        $this->assertNotEmpty($res->json('data.token'));
    }

    public function test_rejects_a_wrong_password(): void
    {
        User::factory()->create(['nickname' => '길찾기왕', 'password' => 'secret123']);

        $this->postJson('/api/auth/login', [
            'nickname' => '길찾기왕',
            'password' => 'wrong-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('nickname');
    }

    public function test_me_requires_a_token_and_logout_revokes_it(): void
    {
        $login = $this->postJson('/api/auth/login', [
            'nickname' => User::factory()->create(['nickname' => '길찾기왕', 'password' => 'secret123'])->nickname,
            'password' => 'secret123',
        ])->assertOk();

        $token = $login->json('data.token');

        $this->getJson('/api/auth/me')->assertUnauthorized();
        $this->withToken($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.nickname', '길찾기왕');
        $this->withToken($token)->postJson('/api/auth/logout')->assertNoContent();
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }
}
