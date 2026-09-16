<?php
$conn = new mysqli('127.0.0.1', 'root', '', 'project_pace');
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
$result = $conn->query("SHOW TABLES");
while ($row = $result->fetch_array()) {
    echo $row[0] . "\n";
}
$conn->close();
?>
