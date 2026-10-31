<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Nickname + password accounts, issued as Sanctum bearer tokens.
 * The browser keeps the token and sends it as "Authorization: Bearer ...".
 */
class AuthController extends Controller
{
    /**
     * POST /api/auth/register — create an account and sign it in.
     */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nickname' => ['required', 'string', 'min:3', 'max:20', 'regex:/^[0-9A-Za-z가-힣_]+$/u', 'unique:users,nickname'],
            'password' => ['required', 'string', 'min:6', 'max:72', 'confirmed'],
        ], [
            'nickname.required' => '닉네임을 입력해 주세요',
            'nickname.min' => '닉네임은 3자 이상이어야 해요',
            'nickname.max' => '닉네임은 20자까지 쓸 수 있어요',
            'nickname.regex' => '닉네임에는 한글, 영문, 숫자, 밑줄만 쓸 수 있어요',
            'nickname.unique' => '이미 쓰고 있는 닉네임이에요',
            'password.required' => '비밀번호를 입력해 주세요',
            'password.min' => '비밀번호는 6자 이상이어야 해요',
            'password.max' => '비밀번호는 72자까지 쓸 수 있어요',
            'password.confirmed' => '비밀번호가 서로 달라요',
        ]);

        $user = User::create([
            'name' => $data['nickname'],
            'nickname' => $data['nickname'],
            'password' => $data['password'], // the model hashes this cast
        ]);

        return response()->json($this->session($user), 201);
    }

    /**
     * POST /api/auth/login — sign in with nickname and password.
     */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nickname' => ['required', 'string'],
            'password' => ['required', 'string'],
        ], [
            'nickname.required' => '닉네임을 입력해 주세요',
            'password.required' => '비밀번호를 입력해 주세요',
        ]);

        $user = User::where('nickname', $data['nickname'])->first();

        // Same message either way, so the form never reveals which nicknames exist.
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'nickname' => '닉네임 또는 비밀번호가 맞지 않아요',
            ]);
        }

        return response()->json($this->session($user));
    }

    /**
     * GET /api/auth/me — the account behind the token, for restoring a session.
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => new UserResource($request->user())]);
    }

    /**
     * POST /api/auth/logout — revoke only the token this device used.
     */
    public function logout(Request $request): Response
    {
        $token = $request->user()->currentAccessToken();
        // Bearer-token requests get a PersonalAccessToken; session-based ones have nothing to revoke.
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        return response()->noContent();
    }

    /**
     * @return array{data: array{token: string, user: UserResource}}
     */
    private function session(User $user): array
    {
        return [
            'data' => [
                'token' => $user->createToken('app')->plainTextToken,
                'user' => new UserResource($user),
            ],
        ];
    }
}
