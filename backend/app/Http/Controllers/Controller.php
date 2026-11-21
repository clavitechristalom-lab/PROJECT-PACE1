<?php

namespace App\Http\Controllers;

abstract class Controller
{
    /**
     * Helper to export a given query or collection as a CSV response.
     */
    protected function exportCsv($filename, array $headers, $dataQuery, callable $mapCallback)
    {
        $callback = function () use ($headers, $dataQuery, $mapCallback) {
            $file = fopen('php://output', 'w');
            // UTF-8 BOM ensures Excel and spreadsheet viewers render currency (₱) and accented text properly
            fwrite($file, "\xEF\xBB\xBF");
            fputcsv($file, $headers);

            $dataQuery->chunk(500, function ($records) use ($file, $mapCallback) {
                foreach ($records as $record) {
                    $row = array_map(function ($cell) {
                        if ($cell === null) return '';
                        if (is_bool($cell)) return $cell ? 'Yes' : 'No';
                        return preg_replace("/\r\n|\r|\n/", ' ', (string) $cell);
                    }, $mapCallback($record));
                    fputcsv($file, $row);
                }
            });

            fclose($file);
        };

        return response()->stream($callback, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'Cache-Control' => 'no-store, no-cache',
        ]);
    }
}
