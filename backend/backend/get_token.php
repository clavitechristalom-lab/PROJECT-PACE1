<?php
$pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=project_pace', 'root', '');
$stmt = $pdo->query("SELECT employee_code, first_name, last_name, branch, qr_token FROM employees WHERE status = 'Active' AND qr_active = 1 LIMIT 3");
foreach($stmt as $row) {
    echo $row['first_name'] . ' ' . $row['last_name'] . ' (' . $row['employee_code'] . ' - ' . $row['branch'] . "): " . $row['qr_token'] . "\n";
}
