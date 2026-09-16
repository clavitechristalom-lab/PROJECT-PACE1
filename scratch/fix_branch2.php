<?php
$files = [
    'app/Http/Controllers/AttendanceController.php',
    'app/Http/Controllers/EmployeeController.php',
    'app/Http/Controllers/PayrollController.php',
    'app/Http/Controllers/QrRequestController.php',
    'app/Http/Controllers/ReportController.php',
    'app/Http/Controllers/SearchController.php'
];

foreach ($files as $file) {
    $path = "backend/backend/$file";
    if (!file_exists($path)) continue;
    $content = file_get_contents($path);
    
    // Replace 'branch' => $emp->branch  (and variations)
    $content = preg_replace("/'branch' => \\\$([a-zA-Z0-9_]+)->branch,/", "'branch' => $\\1->branch ? $\\1->branch->name : null,", $content);
    
    // Replace 'branch' => $emp ? $emp->branch : '' (and variations)
    $content = preg_replace("/'branch' => \\\$([a-zA-Z0-9_]+) \? \\\$([a-zA-Z0-9_]+)->branch : ('|null|\"\"),/", "'branch' => $\\1 && $\\1->branch ? $\\1->branch->name : \\3,", $content);
    
    // Replace 'branch' => $employee->branch ?: $storeAdminBranch
    $content = preg_replace("/'branch' => \\\$([a-zA-Z0-9_]+)->branch \?: \\\$([a-zA-Z0-9_]+),/", "'branch' => $\\1->branch ? $\\1->branch->name : $\\2,", $content);

    // Replace strings like "Branch: {$employee->branch}"
    $content = preg_replace("/\{\\\$([a-zA-Z0-9_]+)->branch\}/", "' . ($\\1->branch ? $\\1->branch->name : 'Unassigned') . '", $content);

    file_put_contents($path, $content);
}
echo "Done!\n";
