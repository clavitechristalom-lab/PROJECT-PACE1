<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\CustomerDashboardController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\InstallmentController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\PayrollController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SystemController;
use App\Http\Controllers\TransactionController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\QrRequestController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\SyncController;

// ─── Authentication (Public) ──────────────────────────────────────────────────
Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);
Route::get('/registration-options', [AuthController::class, 'registrationOptions']);

// ─── Protected Routes (Sanctum Authenticated) ─────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/sync/status', [SyncController::class, 'status']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/user/profile-image', [AuthController::class, 'uploadProfileImage']);

    // Branches
    Route::get('/branches', [BranchController::class, 'index']);
    Route::post('/branches', [BranchController::class, 'store']);
    Route::put('/branches/{id}', [BranchController::class, 'update']);
    Route::delete('/branches/{id}', [BranchController::class, 'destroy']);
    Route::post('/branches/{id}/image', [BranchController::class, 'uploadImage']);

    Route::get('/search', [SearchController::class, 'search']);

    // ─── Transactions (Unified History) ─────────────────────────────────────────
    Route::get('/transactions', [TransactionController::class, 'index']);

    // ─── Dashboard ──────────────────────────────────────────────────────────────
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);
    Route::get('/dashboard/business-performance', [DashboardController::class, 'businessPerformance']);
    Route::get('/dashboard/branch-comparison', [DashboardController::class, 'branchComparison']);
    Route::get('/dashboard/alerts', [DashboardController::class, 'alerts']);
    Route::get('/dashboard/charts', [DashboardController::class, 'charts']);
    Route::get('/dashboard/recent', [DashboardController::class, 'recent']);

    // ─── Products / Inventory ───────────────────────────────────────────────────
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/{id}', [ProductController::class, 'show']);
    Route::post('/products', [ProductController::class, 'store']);
    Route::put('/products/{id}', [ProductController::class, 'update']);
    Route::delete('/products/{id}', [ProductController::class, 'destroy']);

    // ─── Customers ──────────────────────────────────────────────────────────────
    Route::get('/customers', [CustomerController::class, 'index']);
    Route::get('/customers/{id}', [CustomerController::class, 'show']);
    Route::post('/customers', [CustomerController::class, 'store']);
    Route::put('/customers/{id}', [CustomerController::class, 'update']);
    Route::delete('/customers/{id}', [CustomerController::class, 'destroy']);
    // Admin-only: assign customer to a branch
    Route::put('/customers/{id}/branch', [CustomerController::class, 'assignBranch']);

    // ─── Sales ──────────────────────────────────────────────────────────────────
    Route::get('/sales', [SaleController::class, 'index']);
    Route::get('/sales/{id}', [SaleController::class, 'show']);
    Route::post('/sales', [SaleController::class, 'store']);

    // ─── Installments ───────────────────────────────────────────────────────────
    Route::get('/installments', [InstallmentController::class, 'index']);
    Route::get('/installments/overdue', [InstallmentController::class, 'overdue']);
    Route::get('/installments/{id}', [InstallmentController::class, 'show']);
    Route::post('/installments', [InstallmentController::class, 'store']);
    Route::put('/installments/{id}', [InstallmentController::class, 'update']);
    Route::delete('/installments/{id}', [InstallmentController::class, 'destroy']);

    // ─── Payments & Schedules ───────────────────────────────────────────────────
    Route::get('/payments', [PaymentController::class, 'index']);
    Route::get('/payments/monitoring', [PaymentController::class, 'monitoring']);
    Route::get('/payments/{id}', [PaymentController::class, 'show']);
    Route::post('/payments', [PaymentController::class, 'store']);
    Route::get('/payment-schedules', [PaymentController::class, 'schedules']);

    // ─── Employee Self-Service (Employee Role / Scoped) ─────────────────────────
    Route::get('/employee/me', [EmployeeController::class, 'me']);
    Route::put('/employee/me', [EmployeeController::class, 'updateMe']);
    Route::get('/employee/me/attendance', [AttendanceController::class, 'meAttendance']);
    Route::get('/employee/me/payroll', [PayrollController::class, 'mePayroll']);
    Route::get('/employee/me/payslip/{id}', [PayrollController::class, 'mePayslip']);
    Route::post('/employee/verify-account', [EmployeeController::class, 'verifyAccount']);
    Route::post('/employee/me/verify', [EmployeeController::class, 'verifyMe']);
    Route::post('/employee/me/verify-attendance-pin', [AttendanceController::class, 'approveVerification']);
    Route::get('/employee/me/pending-verifications', [AttendanceController::class, 'pendingVerifications']);
    Route::get('/employees/{id}/qr', [EmployeeController::class, 'getQr']);

    // ─── Attendance QR Requests (Employee & Store Admin User Requests) ───────────
    Route::post('/qr-requests', [QrRequestController::class, 'store']);
    Route::get('/qr-requests/my', [QrRequestController::class, 'myRequest']);

    // ─── Store Administrator QR Attendance Scanner (STRICT: Store Admin Only) ───
    Route::middleware('role:Store Administrator,Store Admin')->group(function () {
        Route::post('/attendance/scan', [AttendanceController::class, 'scan']);
        Route::post('/attendance/verify-qr', [AttendanceController::class, 'verifyQr']);
        Route::post('/attendance/verify-pin', [AttendanceController::class, 'verifyPin']);
        Route::get('/attendance/check-verification/{id}', [AttendanceController::class, 'checkVerification']);
    });

    // ─── Attendance Records & Summary (Scoped by Role) ───────────────────────────
    Route::get('/attendance', [AttendanceController::class, 'index']);
    Route::get('/attendance/summary', [AttendanceController::class, 'summary']);
    Route::get('/attendance/scan-logs', [AttendanceController::class, 'scanLogs']);

    // ─── Administrator Only: QR Management, Requests, Audit & Operations ────────
    Route::middleware('role:Administrator')->group(function () {
        Route::get('/admin/qr-requests', [QrRequestController::class, 'index']);
        Route::get('/admin/qr-requests/{id}', [QrRequestController::class, 'show']);
        Route::post('/admin/qr-requests/{id}/review', [QrRequestController::class, 'review']);
        Route::post('/admin/qr-requests/{id}/approve', [QrRequestController::class, 'approve']);
        Route::post('/admin/qr-requests/{id}/reject', [QrRequestController::class, 'reject']);

    });

    // ─── Employee Management (Role-based access is handled in the controller) ────────
    Route::middleware('role:Administrator,Store Administrator,Store Admin,Employee')->group(function () {
        Route::get('/employees', [EmployeeController::class, 'index']);
        Route::get('/employees/{id}', [EmployeeController::class, 'show']);
        Route::post('/employees', [EmployeeController::class, 'store']);
        Route::put('/employees/{id}', [EmployeeController::class, 'update']);
        Route::delete('/employees/{id}', [EmployeeController::class, 'destroy']);
        Route::post('/employees/{id}/qr/generate', [EmployeeController::class, 'generateQr']);
        Route::post('/employees/{id}/qr/revoke', [EmployeeController::class, 'revokeQr']);
        Route::post('/employees/{id}/qr/reissue', [EmployeeController::class, 'reissueQr']);
        Route::post('/employees/{id}/qr/regenerate', [EmployeeController::class, 'regenerateQr']);
        Route::post('/employees/{id}/qr/disable', [EmployeeController::class, 'disableQr']);
        Route::post('/employees/{id}/qr/enable', [EmployeeController::class, 'enableQr']);
        Route::post('/employees/{id}/qr/toggle', [EmployeeController::class, 'toggleQr']);
        Route::post('/employees/{id}/pin', [EmployeeController::class, 'setPin']);
        Route::post('/employees/{id}/verify', [EmployeeController::class, 'verifyEmployee']);
        Route::post('/employees/{id}/unverify', [EmployeeController::class, 'unverifyEmployee']);
    });

    Route::middleware('role:Administrator')->group(function () {
        Route::get('/admin/qr-monitoring', [EmployeeController::class, 'getQrMonitoringStats']);

        // ─── Employee Financial Settings (Allowances, Deductions, Loans) ─────────
        Route::get('/employees/{id}/financials', [\App\Http\Controllers\EmployeeFinancialController::class, 'getFinancials']);
        Route::post('/employees/{id}/allowances', [\App\Http\Controllers\EmployeeFinancialController::class, 'addAllowance']);
        Route::delete('/employees/allowances/{id}', [\App\Http\Controllers\EmployeeFinancialController::class, 'deleteAllowance']);
        Route::post('/employees/{id}/deductions', [\App\Http\Controllers\EmployeeFinancialController::class, 'addDeduction']);
        Route::delete('/employees/deductions/{id}', [\App\Http\Controllers\EmployeeFinancialController::class, 'deleteDeduction']);
        Route::post('/employees/{id}/loans', [\App\Http\Controllers\EmployeeFinancialController::class, 'addLoan']);
        Route::delete('/employees/loans/{id}', [\App\Http\Controllers\EmployeeFinancialController::class, 'deleteLoan']);
    });

    // ─── Payroll (Admin & Store Admin Scoped) ────────────────────────────────────
    Route::get('/payroll', [PayrollController::class, 'index']);
    Route::get('/payroll/{id}/payslip', [PayrollController::class, 'show']);
    Route::get('/payroll-periods', [PayrollController::class, 'periods']);

    Route::middleware('role:Store Administrator,Store Admin')->group(function () {
        Route::post('/payroll/generate', [PayrollController::class, 'generate']);
        Route::post('/payroll/generate-13th-month', [PayrollController::class, 'generate13thMonth']);
        Route::put('/payroll/{id}/approve', [PayrollController::class, 'approve']);
        Route::put('/payroll/{id}/mark-paid', [PayrollController::class, 'markPaid']);
        Route::post('/payroll-periods', [PayrollController::class, 'storePeriod']);
        Route::put('/payroll-periods/{id}/close', [PayrollController::class, 'closePeriod']);
    });

    // ─── Reports ────────────────────────────────────────────────────────────────
    Route::get('/reports/employees', [ReportController::class, 'employees']);
    Route::get('/reports/sales', [ReportController::class, 'sales']);
    Route::get('/reports/inventory', [ReportController::class, 'inventory']);
    Route::get('/reports/installments', [ReportController::class, 'installments']);
    Route::get('/reports/payroll', [ReportController::class, 'payroll']);
    Route::get('/reports/attendance', [ReportController::class, 'attendance']);

    // ─── System & Admin (Administrator Role Only) ────────────────────────────────
    Route::middleware('role:Administrator')->group(function () {
        Route::get('/users', [SystemController::class, 'users']);
        Route::get('/users/{id}', [SystemController::class, 'showUser']);
        Route::post('/users', [SystemController::class, 'storeUser']);
        Route::put('/users/{id}', [SystemController::class, 'updateUser']);
        Route::delete('/users/{id}', [SystemController::class, 'destroyUser']);
        Route::post('/users/{id}/verify', [SystemController::class, 'verifyUser']);
        Route::post('/users/{id}/revoke-verification', [SystemController::class, 'revokeUserVerification']);
        Route::get('/admin/users', [SystemController::class, 'users']);
        Route::get('/admin/users/{id}', [SystemController::class, 'showUser']);
        Route::post('/admin/users/{id}/verify', [SystemController::class, 'verifyUser']);
        Route::post('/admin/users/{id}/revoke-verification', [SystemController::class, 'revokeUserVerification']);
        Route::get('/system-logs', [SystemController::class, 'logs']);
        Route::get('/backups', [SystemController::class, 'backups']);
        Route::post('/backups/create', [SystemController::class, 'createBackup']);
        Route::post('/backups/{id}/restore', [SystemController::class, 'restoreBackup']);
        Route::get('/settings', [SystemController::class, 'settings']);
        Route::post('/settings', [SystemController::class, 'saveSettings']);
    });
    
    // ─── Notifications ──────────────────────────────────────────────────────────
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/latest', [NotificationController::class, 'latest']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::get('/notifications/{id}', [NotificationController::class, 'show']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::post('/notifications/{id}/unread', [NotificationController::class, 'markAsUnread']);
    Route::delete('/notifications/clear-all', [NotificationController::class, 'clearAllRead']);
    Route::delete('/notifications/{id}', [NotificationController::class, 'destroy']);

    // 🌟 Customer App 🌟
    Route::get('/customer/dashboard', [CustomerDashboardController::class, 'getDashboard']);
    Route::get('/customer/installments', [CustomerDashboardController::class, 'getInstallments']);
    
    // Support Messages
    Route::get('/support-messages', [\App\Http\Controllers\SupportMessageController::class, 'index']);
    Route::post('/support-messages', [\App\Http\Controllers\SupportMessageController::class, 'store']);
    Route::put('/support-messages/{id}', [\App\Http\Controllers\SupportMessageController::class, 'update']);
    Route::delete('/support-messages/{id}', [\App\Http\Controllers\SupportMessageController::class, 'destroy']);

    // Carousel Images
    Route::get('/carousel-images/active', [\App\Http\Controllers\CarouselImageController::class, 'active']);
    Route::middleware('role:Administrator')->group(function () {
        Route::get('/carousel-images', [\App\Http\Controllers\CarouselImageController::class, 'index']);
        Route::post('/carousel-images', [\App\Http\Controllers\CarouselImageController::class, 'store']);
        Route::put('/carousel-images/{id}', [\App\Http\Controllers\CarouselImageController::class, 'update']);
        Route::delete('/carousel-images/{id}', [\App\Http\Controllers\CarouselImageController::class, 'destroy']);
    });
});
