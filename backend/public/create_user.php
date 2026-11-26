<?php
http_response_code(403);
header('Content-Type: application/json');
echo json_encode([
    'success' => false,
    'message' => 'Direct public PHP endpoints are disabled. Use authenticated Laravel /api endpoints.',
]);
exit;
