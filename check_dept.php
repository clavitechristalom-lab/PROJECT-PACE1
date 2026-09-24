<?php
$pdo = new PDO('sqlite:backend/backend/database/database.sqlite');
$stmt = $pdo->query('SELECT DISTINCT department FROM employees');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
