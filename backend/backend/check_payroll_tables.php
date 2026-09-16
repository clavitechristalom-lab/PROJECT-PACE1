<?php
$conn = new mysqli('127.0.0.1', 'root', '', 'project_pace');
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
$tables = ['payroll', 'payroll_periods', 'payroll_items', 'allowances', 'deductions', 'bonuses', 'loans', 'payslips', 'government_contributions', 'payroll_allowances', 'payroll_deductions', 'payroll_bonuses', 'payroll_loans'];
foreach ($tables as $table) {
    $result = $conn->query("SHOW TABLES LIKE '$table'");
    if ($result->num_rows > 0) {
        echo "Table $table:\n";
        $res = $conn->query("DESCRIBE `$table`");
        while ($row = $res->fetch_assoc()) {
            echo "  " . $row['Field'] . " (" . $row['Type'] . ")\n";
        }
    } else {
        echo "Table $table DOES NOT EXIST.\n";
    }
}
$conn->close();
?>
