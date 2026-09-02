<?php
$pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=project_pace', 'root', '');
$stmt = $pdo->query('DESCRIBE employees');
foreach($stmt as $row) {
    echo $row['Field'] . "\n";
}
