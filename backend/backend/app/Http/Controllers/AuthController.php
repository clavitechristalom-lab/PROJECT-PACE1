<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Models\SystemLog;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,username',
            'password' => 'required|string|min:6',
            'role' => 'required|string|in:Administrator,Store Administrator,Employee'
        ]);

        $nameParts = explode(' ', $validated['name'], 2);
        $firstName = $nameParts[0];
        $lastName = $nameParts[1] ?? '';

        $employee = \App\Models\Employee::create([
            'employee_code' => 'EMP-' . str_pad(\App\Models\Employee::count() + 1, 3, '0', STR_PAD_LEFT),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $validated['email'],
            'position' => $validated['role'],
            'status' => 'Active',
            'pay_type' => 'Monthly',
            'basic_salary' => 0
        ]);

        $user = User::create([
            'username' => $validated['email'],
            'password_hash' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'is_active' => true,
            'employee_id' => $employee->employee_id
        ]);

        return response()->json([
            'message' => 'Registration successful',
            'user' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'role' => $user->role,
                'name' => $validated['name'],
            ]
        ], 201);
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
            'role' => 'required|string',
        ]);

        $user = User::with('employee')->where('username', $credentials['username'])->first();

        if ($user && Hash::check($credentials['password'], $user->password_hash)) {
            if ($user->role !== $credentials['role']) {
                return response()->json([
                    'message' => 'Selected role does not match your account.'
                ], 401);
            }
            if (!$user->is_active) {
                return response()->json([
                    'message' => 'Account is inactive. Please contact your system administrator.'
                ], 403);
            }

            $user->last_login = now();
            $user->save();

            // Log login event
            SystemLog::create([
                'user_id' => $user->user_id,
                'action' => 'LOGIN',
                'module' => 'Auth',
                'description' => "{$user->role} ({$user->username}) logged in successfully",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            $lastLogin = null;
            if ($user->last_login) {
                $lastLogin = $user->last_login instanceof \DateTimeInterface
                    ? $user->last_login->format('Y-m-d H:i')
                    : (string)$user->last_login;
            }

            $userData = [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'employee_id' => $user->employee_id,
                'role' => $user->role,
                'is_active' => (bool)$user->is_active,
                'name' => $user->employee ? trim("{$user->employee->first_name} {$user->employee->last_name}") : $user->username,
                'last_login' => $lastLogin,
            ];

            return response()->json([
                'message' => 'Login successful',
                'user' => $userData,
                'session_token' => $user->createToken('auth_token')->plainTextToken,
            ], 200);
        }

        return response()->json([
            'message' => 'Invalid username or password'
        ], 401);
    }

    public function me(Request $request)
    {
        $user = $request->user();
        $userId = $user ? $user->user_id : null;
        if (!$userId) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        // We already have the authenticated user via Sanctum, but let's load employee relation
        $user->load('employee');
        if (!$user) {
            return response()->json(['message' => 'User account not found'], 404);
        }

        if (!$user->is_active) {
            return response()->json(['message' => 'Account is inactive'], 403);
        }

        $lastLogin = null;
        if ($user->last_login) {
            $lastLogin = $user->last_login instanceof \DateTimeInterface
                ? $user->last_login->format('Y-m-d H:i')
                : (string)$user->last_login;
        }

        return response()->json([
            'user' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'employee_id' => $user->employee_id,
                'role' => $user->role,
                'is_active' => (bool)$user->is_active,
                'name' => $user->employee ? trim("{$user->employee->first_name} {$user->employee->last_name}") : $user->username,
                'last_login' => $lastLogin,
            ]
        ]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user) {
            SystemLog::create([
                'user_id' => $user->user_id,
                'action' => 'LOGOUT',
                'module' => 'Auth',
                'description' => "User {$user->username} logged out",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
            $user->currentAccessToken()->delete();
        }

        return response()->json(['message' => 'Logged out successfully']);
    }
}
