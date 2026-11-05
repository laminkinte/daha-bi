<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Chart;
use App\Models\Dashboard;
use App\Services\ChartDataService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class DashboardExportController extends Controller
{
    public function __construct(protected ChartDataService $chartData)
    {
    }

    /**
     * A real .xlsx workbook — one sheet per chart, with that chart's actual computed data (the
     * same aggregate a viewer sees on screen), not just a text summary. Charts that fail to
     * compute are skipped rather than failing the whole export.
     */
    public function excel(Request $request, Dashboard $dashboard)
    {
        $role = $dashboard->roleFor($request->user());
        abort_unless($role !== null, Response::HTTP_FORBIDDEN);

        $dashboard->load('charts.dataset:id,name,columns');

        $spreadsheet = new Spreadsheet();
        $spreadsheet->removeSheetByIndex(0);

        $usedTitles = [];

        foreach ($dashboard->charts as $chart) {
            if (! $chart->dataset) {
                continue;
            }

            try {
                $data = $this->chartData->run($chart->dataset, $chart->type, $chart->config ?? [], [], $request->user());
            } catch (Throwable) {
                continue;
            }

            $sheet = $spreadsheet->createSheet();
            $sheet->setTitle($this->uniqueSheetTitle($chart->title, $usedTitles));
            $this->writeChart($sheet, $chart, $data);
        }

        if ($spreadsheet->getSheetCount() === 0) {
            $spreadsheet->createSheet()->setTitle('No data')
                ->setCellValue('A1', 'This dashboard has no charts with computable data to export.');
        }

        $filename = Str::slug($dashboard->name ?: 'dashboard').'.xlsx';
        $writer = new Xlsx($spreadsheet);

        return response()->streamDownload(function () use ($writer) {
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * Excel sheet names: max 31 chars, no : \ / ? * [ ], and must be unique within the workbook —
     * two charts sharing a title is common (e.g. duplicated charts), so a numeric suffix disambiguates.
     *
     * @param  array<string, int>  $usedTitles
     */
    protected function uniqueSheetTitle(string $title, array &$usedTitles): string
    {
        $clean = preg_replace('/[:\\\\\/?*\[\]]/', '', $title);
        $clean = trim((string) $clean) ?: 'Chart';
        $base = mb_substr($clean, 0, 31);

        $key = mb_strtolower($base);
        if (! isset($usedTitles[$key])) {
            $usedTitles[$key] = 1;

            return $base;
        }

        $usedTitles[$key]++;
        $suffix = ' ('.$usedTitles[$key].')';

        return mb_substr($base, 0, 31 - mb_strlen($suffix)).$suffix;
    }

    protected function cellRef(int $columnIndex, int $row): string
    {
        return Coordinate::stringFromColumnIndex($columnIndex).$row;
    }

    protected function writeChart(Worksheet $sheet, Chart $chart, array $data): void
    {
        $sheet->setCellValue('A1', $chart->title);
        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(14);

        $headerRow = 3;
        $config = $chart->config ?? [];

        if (isset($data['columns'], $data['rows'])) {
            $this->writeTable($sheet, $headerRow, $data['columns'], $data['rows']);
        } elseif (isset($data['value'])) {
            $sheet->setCellValue('A'.$headerRow, $config['agg'] ?? 'value');
            $sheet->setCellValue('B'.$headerRow, $data['value']);
            $sheet->getStyle('A'.$headerRow)->getFont()->setBold(true);
        } elseif (isset($data['series'])) {
            $this->writeMultiSeries($sheet, $headerRow, $config, $data);
        } elseif (isset($data['labels'], $data['values'])) {
            $this->writeSingleSeries($sheet, $headerRow, $config, $data['labels'], $data['values']);
        } elseif (isset($data['points'])) {
            $this->writePoints($sheet, $headerRow, $config, $data['points']);
        }

        foreach (range('A', 'H') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }
    }

    protected function writeTable(Worksheet $sheet, int $row, array $columns, array $rows): void
    {
        $columns = array_values($columns);

        foreach ($columns as $i => $name) {
            $sheet->setCellValue($this->cellRef($i + 1, $row), $name);
        }
        $sheet->getStyle("A{$row}:".$this->cellRef(count($columns), $row))->getFont()->setBold(true);

        $row++;
        foreach ($rows as $r) {
            foreach ($columns as $i => $name) {
                $sheet->setCellValue($this->cellRef($i + 1, $row), $r[$name] ?? null);
            }
            $row++;
        }
    }

    protected function writeSingleSeries(Worksheet $sheet, int $row, array $config, array $labels, array $values): void
    {
        $sheet->setCellValue('A'.$row, $config['x_field'] ?? 'Label');
        $sheet->setCellValue('B'.$row, $config['y_field'] ?? 'Value');
        $sheet->getStyle("A{$row}:B{$row}")->getFont()->setBold(true);

        $row++;
        foreach ($labels as $i => $label) {
            $sheet->setCellValue('A'.$row, $label);
            $sheet->setCellValue('B'.$row, $values[$i] ?? null);
            $row++;
        }
    }

    protected function writeMultiSeries(Worksheet $sheet, int $row, array $config, array $data): void
    {
        $sheet->setCellValue('A'.$row, $config['x_field'] ?? 'Category');
        foreach ($data['series'] as $i => $series) {
            $sheet->setCellValue($this->cellRef($i + 2, $row), $series['name']);
        }
        $sheet->getStyle('A'.$row.':'.$this->cellRef(count($data['series']) + 1, $row))->getFont()->setBold(true);

        $row++;
        foreach ($data['labels'] as $li => $label) {
            $sheet->setCellValue('A'.$row, $label);
            foreach ($data['series'] as $si => $series) {
                $sheet->setCellValue($this->cellRef($si + 2, $row), $series['values'][$li] ?? null);
            }
            $row++;
        }
    }

    protected function writePoints(Worksheet $sheet, int $row, array $config, array $points): void
    {
        $sheet->setCellValue('A'.$row, $config['x_field'] ?? 'X');
        $sheet->setCellValue('B'.$row, $config['y_field'] ?? 'Y');
        $sheet->getStyle("A{$row}:B{$row}")->getFont()->setBold(true);

        $row++;
        foreach ($points as $p) {
            $sheet->setCellValue('A'.$row, $p['x'] ?? null);
            $sheet->setCellValue('B'.$row, $p['y'] ?? null);
            $row++;
        }
    }
}
