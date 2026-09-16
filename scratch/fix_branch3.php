<?php
$files = [
    'app/Http/Controllers/AttendanceController.php',
    'app/Http/Controllers/ReportController.php',
];

foreach ($files as $file) {
    $path = "backend/backend/$file";
    if (!file_exists($path)) continue;
    $content = file_get_contents($path);
    
    // Replace 'branch' => $emp ? $emp->branch : '' 
    $content = preg_replace("/\\\$emp \? \\\$emp->branch : ('|null|\"\")/", "\$emp && \$emp->branch ? \$emp->branch->name : \\1", $content);
    
    // Replace 'employee_branch' => $employee->branch,
    $content = preg_replace("/'employee_branch' => \\\$employee->branch,/", "'employee_branch' => \$employee->branch ? \$employee->branch->name : null,", $content);
    
    // Replace 'branch' => $l->branch ?: ($emp ? $emp->branch : null),
    $content = preg_replace("/'branch' => \\\$l->branch \?: \(\\\$emp \? \\\$emp->branch : null\),/", "'branch' => \$l->branch ? \$l->branch->name : (\$emp && \$emp->branch ? \$emp->branch->name : null),", $content);

    file_put_contents($path, $content);
}
echo "Done2!\n";
