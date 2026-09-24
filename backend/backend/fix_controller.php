<?php
$file = 'c:/Users/User/Downloads/frontend and backend-20260822T124414Z-1-001/frontend and backend/backend/backend/app/Http/Controllers/InstallmentController.php';
$content = file_get_contents($file);

// The user changed: use App\Models\InstallmentAccount; -> use App\Models\Installment;
$content = str_replace('use App\Models\Installment;', 'use App\Models\InstallmentAccount;', $content);

// The user changed: InstallmentAccount::with(...) -> Installment::with(...)
$content = str_replace('Installment::with', 'InstallmentAccount::with', $content);
$content = str_replace('Installment::', 'InstallmentAccount::', $content); // catch any others

file_put_contents($file, $content);
echo "Fixed InstallmentController.php";
