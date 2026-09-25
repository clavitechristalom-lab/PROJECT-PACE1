<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use App\Models\User;
use App\Models\SystemLog;
use App\Models\Notification;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $role = $request->input('role');
        $role = $role === 'Store Admin' ? 'Store Administrator' : $role;

        $allowedRoles = ['Administrator', 'Store Administrator', 'Employee', 'Customer'];
        if (!in_array($role, $allowedRoles, true)) {
            throw ValidationException::withMessages(['role' => 'The selected account role is invalid.']);
        }

        $rules = [
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'phone' => 'required|string|max:50',
            'address' => 'required|string',
            'email' => 'required|string|email|max:255',
            'username' => 'required|string|max:255|unique:users,username',
            'password' => 'required|string|min:6|same:confirmPassword',
            'confirmPassword' => 'required|string',
            'role' => 'required|string',
        ];

        if ($role === 'Customer') {
            $rules['username'] = 'required|string|max:255';
        } else {
            $rules['branch_id'] = 'required_if:role,Store Admin,Store Administrator,Employee|exists:branch_profiles,id';
        }

        $validated = $request->validate($rules);

        $emailExists = DB::table('employees')->where('email', $validated['email'])->exists()
            || DB::table('customers')->where('email', $validated['email'])->exists()
            || DB::table('users')->where('username', $validated['email'])->exists();
        if ($emailExists) {
            throw ValidationException::withMessages(['email' => 'This email is already registered.']);
        }

        $firstName = $validated['first_name'];
        $middleName = $validated['middle_name'] ?? null;
        $lastName = $validated['last_name'];
        $phone = $validated['phone'];
        $address = $validated['address'];

        if ($role === 'Customer') {
            // Customer signs up with branch_id = NULL.
            // Admin will assign them to a branch later via the Customer Management interface.
            $maxId = \App\Models\Customer::max('customer_id');
            $nextId = $maxId ? $maxId + 1 : 1;
            $customer = \App\Models\Customer::create([
                'customer_code' => 'CUS-' . str_pad($nextId, 3, '0', STR_PAD_LEFT),
                'first_name' => $firstName,
                'middle_name' => $middleName,
                'last_name' => $lastName,
                'email' => $validated['email'],
                'phone' => $phone,
                'address' => $address,
                'status' => 'Active',
                'branch_id' => null,
            ]);

            $user = User::create([
                'username' => $validated['email'],
                'password_hash' => Hash::make($validated['password']),
                'role' => $role,
                'is_active' => true,
                'customer_id' => $customer->customer_id
            ]);
        } else {
            // For all staff roles (Administrator, Store Administrator, Employee), create a new employee record.
            $maxId = \App\Models\Employee::max('employee_id');
            $nextId = $maxId ? $maxId + 1 : 1;
            $employeeCode = 'EMP-' . str_pad($nextId, 3, '0', STR_PAD_LEFT);
            $employee = \App\Models\Employee::create([
                'employee_code' => $employeeCode,
                'first_name' => $firstName,
                'middle_name' => $middleName,
                'last_name' => $lastName,
                'email' => $validated['email'],
                'phone' => $phone,
                'address' => $address,
                'position' => $role,
                'status' => 'Active',
                'pay_type' => 'Monthly',
                'basic_salary' => 0,
                'branch_id' => in_array($role, ['Store Administrator', 'Employee']) ? ($validated['branch_id'] ?? null) : null,
                'department' => null,
            ]);

            $user = User::create([
                'username' => $validated['username'],
                'password_hash' => Hash::make($validated['password']),
                'role' => $role,
                'is_active' => true,
                'employee_id' => $employee->employee_id,
            ]);
        }

        if ($role === 'Customer') {
            $adminsAndStoreAdmins = User::whereIn('role', ['Administrator', 'Store Administrator'])->get();
            foreach ($adminsAndStoreAdmins as $adminUser) {
                Notification::create([
                    'user_id' => $adminUser->user_id,
                    'type' => 'System',
                    'title' => 'NEW CUSTOMER ACCOUNT',
                    'message' => "Customer: {$validated['first_name']} {$validated['last_name']}\nEmail: {$validated['email']}\nBranch: Unassigned\nCreated: " . now()->format('Y-m-d H:i:s'),
                    'module' => 'Customers',
                    'related_id' => $user->user_id,
                    'related_type' => 'User',
                    'action_url' => '/customers',
                    'priority' => 'medium',
                    'is_read' => false,
                ]);
            }
        }

        return response()->json([
            'message' => 'Registration successful',
            'user' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'role' => $user->role,
                'name' => trim("{$validated['first_name']} {$validated['last_name']}"),
            ]
        ], 201);
    }

    public function registrationOptions()
    {
        return response()->json([
            'branches' => \App\Models\BranchProfile::query()
                ->where('status', '!=', 'closed')
                ->orderBy('name')
                ->get(['id', 'name']),
            'departments' => ['Store Admin', 'Employee'],
        ]);
    }

    /**
     * Build consistent user data payload including branch info for Customer role.
     */
    private function buildUserData(User $user): array
    {
        $lastLogin = null;
        if ($user->last_login) {
            $lastLogin = $user->last_login instanceof \DateTimeInterface
                ? $user->last_login->format('Y-m-d H:i')
                : (string)$user->last_login;
        }

        $name = $user->role === 'Customer' && $user->customer
            ? trim("{$user->customer->first_name} {$user->customer->last_name}")
            : ($user->employee ? trim("{$user->employee->first_name} {$user->employee->last_name}") : $user->username);

        $data = [
            'user_id'      => $user->user_id,
            'username'     => $user->username,
            'employee_id'  => $user->employee_id,
            'customer_id'  => $user->customer_id,
            'role'         => $user->role,
            'is_active'    => (bool)$user->is_active,
            'name'         => $name,
            'last_login'   => $lastLogin,
            'profile_image' => $user->profile_image ? url(Storage::url($user->profile_image)) : null,
        ];

        if ($user->employee) {
            $data['employee'] = [
                'employee_id'   => $user->employee->employee_id,
                'employee_code' => $user->employee->employee_code,
                'first_name'    => $user->employee->first_name,
                'last_name'     => $user->employee->last_name,
                'position'      => $user->employee->position,
                'department'    => $user->employee->department,
                'branch_id'     => $user->employee->branch_id,
                'branch'        => $user->employee->branch ? $user->employee->branch->name : null,
            ];
            $data['branch_id']   = $user->employee->branch_id;
            $data['branch_name'] = $user->employee->branch ? $user->employee->branch->name : null;
        }

        // Include branch info for Customer role
        if ($user->customer) {
            $data['customer'] = [
                'customer_id'   => $user->customer->customer_id,
                'customer_code' => $user->customer->customer_code,
                'first_name'    => $user->customer->first_name,
                'last_name'     => $user->customer->last_name,
                'branch_id'     => $user->customer->branch_id,
                'branch'        => $user->customer->branch ? $user->customer->branch->name : null,
            ];
            $data['customer_code'] = $user->customer->customer_code;
            $data['branch_id']     = $user->customer->branch_id;
            $data['branch_name']   = $user->customer->branch ? $user->customer->branch->name : null;
        }

        return $data;
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::with(['employee.branch', 'customer.branch'])
            ->where(function($query) use ($credentials) {
                $query->where('username', $credentials['username'])
                      ->orWhereHas('employee', function($q) use ($credentials) {
                          $q->where('email', $credentials['username']);
                      })
                      ->orWhereHas('customer', function($q) use ($credentials) {
                          $q->where('email', $credentials['username']);
                      });
            })
            ->first();

        if ($user && Hash::check($credentials['password'], $user->password_hash)) {
            if (!$user->is_active) {
                return response()->json([
                    'message' => 'Account is inactive. Please contact your system administrator.'
                ], 403);
            }

            $user->last_login = now();
            $user->save();

            // Log login event
            SystemLog::create([
                'user_id'    => $user->user_id,
                'action'     => 'LOGIN',
                'module'     => 'Auth',
                'description' => "{$user->role} ({$user->username}) logged in successfully",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return response()->json([
                'message'       => 'Login successful',
                'user'          => $this->buildUserData($user),
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

        $user->load(['employee.branch', 'customer.branch']);
        if (!$user) {
            return response()->json(['message' => 'User account not found'], 404);
        }

        if (!$user->is_active) {
            return response()->json(['message' => 'Account is inactive'], 403);
        }

        return response()->json([
            'user' => $this->buildUserData($user)
        ]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user) {
            SystemLog::create([
                'user_id'    => $user->user_id,
                'action'     => 'LOGOUT',
                'module'     => 'Auth',
                'description' => "User {$user->username} logged out",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
            $user->currentAccessToken()->delete();
        }

        return response()->json(['message' => 'Logged out successfully']);
    }

    public function uploadProfileImage(Request $request)
    {
        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:5120'
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        if ($request->hasFile('image')) {
            // Delete old image if it exists
            if ($user->profile_image && Storage::disk('public')->exists($user->profile_image)) {
                Storage::disk('public')->delete($user->profile_image);
            }

            $path = $request->file('image')->store('profiles', 'public');
            $user->profile_image = $path;
            $user->save();

            return response()->json([
                'message'       => 'Profile image updated successfully',
                'profile_image' => url(Storage::url($path))
            ]);
        }

        return response()->json(['message' => 'No image provided'], 400);
    }
}
