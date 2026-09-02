<?php
$conn = new mysqli('127.0.0.1', 'root', '', 'project_pace');
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

$tables = ['attendance', 'attendance_scan_logs'];
foreach ($tables as $table) {
    $result = $conn->query("SHOW TABLES LIKE '$table'");
    if ($result->num_rows > 0) {
        echo "Table $table EXISTS.\n";
        $res = $conn->query("DESCRIBE `$table`");
        $cols = [];
        while ($row = $res->fetch_assoc()) {
            $cols[] = $row;
        }
        print_r($cols);
    } else {
        echo "Table $table DOES NOT EXIST.\n";
    }
}
$conn->close();
?>
