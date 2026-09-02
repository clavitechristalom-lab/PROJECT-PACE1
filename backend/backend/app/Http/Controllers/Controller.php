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
            fputcsv($file, $headers);

            $dataQuery->chunk(500, function ($records) use ($file, $mapCallback) {
                foreach ($records as $record) {
                    $row = $mapCallback($record);
                    fputcsv($file, $row);
                }
            });

            fclose($file);
        };

        return response()->stream($callback, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }
}
