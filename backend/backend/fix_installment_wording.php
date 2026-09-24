<?php
function replaceInDir($dir) {
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
    foreach ($iterator as $file) {
        if ($file->isFile() && in_array($file->getExtension(), ['php', 'jsx', 'js'])) {
            $content = file_get_contents($file->getPathname());
            $origContent = $content;

            // Replace plurals first
            $content = str_replace('Installment Accounts', 'Installment', $content);
            $content = str_replace('Installment accounts', 'Installment', $content);
            $content = str_replace('installment accounts', 'installment', $content);

            // Replace singulars
            $content = str_replace('Installment Account', 'Installment', $content);
            $content = str_replace('Installment account', 'Installment', $content);
            $content = str_replace('installment account', 'installment', $content);

            if ($content !== $origContent) {
                file_put_contents($file->getPathname(), $content);
                echo "Updated {$file->getPathname()}\n";
            }
        }
    }
}

replaceInDir(__DIR__ . '/app');
replaceInDir(dirname(__DIR__, 2) . '/frontend/frontend/src');

echo "Done.\n";
