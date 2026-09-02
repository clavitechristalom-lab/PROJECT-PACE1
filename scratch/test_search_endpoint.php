<?php

require_once __DIR__ . '/../backend/backend/vendor/autoload.php';

$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Http\Controllers\SearchController;
use Illuminate\Http\Request;

echo "========================================================\n";
echo "TEST: GLOBAL SEARCH SYSTEM VERIFICATION\n";
echo "========================================================\n\n";

$pass = 0;
$fail = 0;
function testAssert($cond, $label) {
    global $pass, $fail;
    if ($cond) {
        echo "  [PASS] {$label}\n";
        $pass++;
    } else {
        echo "  [FAIL] {$label}\n";
        $fail++;
    }
}

$adminUser = User::where('role', 'Administrator')->first();
$searchController = new SearchController();

// 1. Test short query (less than 2 chars) -> Should return empty results cleanly
$reqShort = Request::create('/api/search?q=a', 'GET');
$reqShort->setUserResolver(fn() => $adminUser);
$resShort = $searchController->search($reqShort);
testAssert($resShort->getStatusCode() === 200, "Short query returns HTTP 200");
$dataShort = $resShort->getData(true);
testAssert($dataShort['total'] === 0 && empty($dataShort['results']), "Query < 2 chars returns 0 results cleanly");

// 2. Test navigation shortcut search (e.g. 'payroll', 'attendance', 'product')
$reqNav = Request::create('/api/search?q=payroll', 'GET');
$reqNav->setUserResolver(fn() => $adminUser);
$resNav = $searchController->search($reqNav);
$dataNav = $resNav->getData(true);
testAssert($resNav->getStatusCode() === 200, "Keyword 'payroll' search succeeds with HTTP 200");
testAssert($dataNav['total'] > 0, "Found results for 'payroll' (total: {$dataNav['total']})");
testAssert(isset($dataNav['grouped']), "Results grouped by module category cleanly");

// 3. Test employee search by code / name
$reqEmp = Request::create('/api/search?q=EMP', 'GET');
$reqEmp->setUserResolver(fn() => $adminUser);
$resEmp = $searchController->search($reqEmp);
$dataEmp = $resEmp->getData(true);
testAssert($resEmp->getStatusCode() === 200, "Employee query 'EMP' succeeds with HTTP 200");
testAssert(!empty($dataEmp['results']), "Employee results returned successfully");

// 4. Test product search
$reqProd = Request::create('/api/search?q=product', 'GET');
$reqProd->setUserResolver(fn() => $adminUser);
$resProd = $searchController->search($reqProd);
$dataProd = $resProd->getData(true);
testAssert($resProd->getStatusCode() === 200, "Product search succeeds with HTTP 200");

echo "\n========================================================\n";
echo "SUMMARY: Passed {$pass} tests, Failed {$fail} tests.\n";
echo "========================================================\n";
