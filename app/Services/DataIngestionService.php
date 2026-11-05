<?php

namespace App\Services;

use App\Models\DataSource;
use App\Models\Dataset;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use League\Csv\Reader;
use PDO;
use PhpOffice\PhpSpreadsheet\IOFactory;
use RuntimeException;

class DataIngestionService
{
    /**
     * Cap on rows imported per sync, to keep MVP storage/memory bounded.
     */
    protected const MAX_ROWS = 50000;

    protected const CHUNK_SIZE = 500;

    protected const DEFAULT_PORTS = ['mysql' => 3306, 'postgres' => 5432, 'sqlserver' => 1433];

    public function ingestCsv(DataSource $dataSource, UploadedFile $file): Dataset
    {
        $path = $file->store('csv-uploads');
        $fullPath = Storage::path($path);

        [$header, $records] = $this->extractRecords($fullPath, $file->getClientOriginalExtension());

        $dataset = Dataset::create([
            'data_source_id' => $dataSource->id,
            'name' => pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'columns' => $this->buildColumnMeta($header),
            'row_count' => 0,
        ]);

        $rowCount = 0;
        $chunk = [];

        foreach ($records as $record) {
            if ($rowCount >= self::MAX_ROWS) {
                break;
            }

            $chunk[] = [
                'dataset_id' => $dataset->id,
                'data' => json_encode($this->castRow($record)),
                'created_at' => now(),
                'updated_at' => now(),
            ];
            $rowCount++;

            if (count($chunk) >= self::CHUNK_SIZE) {
                DB::table('dataset_rows')->insert($chunk);
                $chunk = [];
            }
        }

        if (! empty($chunk)) {
            DB::table('dataset_rows')->insert($chunk);
        }

        $dataset->update(['row_count' => $rowCount]);
        $dataSource->update([
            'config' => array_merge($dataSource->config ?? [], ['stored_path' => $path]),
        ]);

        return $dataset;
    }

    /**
     * @return array{0: string[], 1: iterable<int, array<string, mixed>>} [header, records] —
     *         records are associative arrays keyed by header, same shape regardless of source
     *         format, so the caller's ingest loop doesn't need to know which format it got.
     */
    protected function extractRecords(string $fullPath, string $extension): array
    {
        if (in_array(strtolower($extension), ['xlsx', 'xls'], true)) {
            return $this->extractExcelRecords($fullPath);
        }

        return $this->extractCsvRecords($fullPath);
    }

    protected function extractCsvRecords(string $fullPath): array
    {
        $csv = Reader::createFromPath($fullPath, 'r');
        $csv->setHeaderOffset(0);

        return [$csv->getHeader(), $csv->getRecords()];
    }

    /**
     * Reads only the active worksheet — a spreadsheet with multiple sheets isn't a use case this
     * import is trying to solve; the first/active one is what most single-table exports use.
     */
    protected function extractExcelRecords(string $fullPath): array
    {
        $sheet = IOFactory::load($fullPath)->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, false);

        $header = array_map(fn ($v) => trim((string) $v), array_shift($rows) ?? []);
        $columnCount = count($header);

        $records = (function () use ($rows, $header, $columnCount) {
            foreach ($rows as $row) {
                $normalized = array_pad(array_slice($row, 0, $columnCount), $columnCount, null);
                yield array_combine($header, $normalized);
            }
        })();

        return [$header, $records];
    }

    public function ingestTable(DataSource $dataSource, ?Dataset $existing = null): Dataset
    {
        $config = $dataSource->config ?? [];

        foreach (['host', 'database', 'username', 'table'] as $key) {
            if (empty($config[$key])) {
                throw new RuntimeException("Missing required database config field: {$key}");
            }
        }

        $table = $config['table'];
        if (! preg_match('/^[A-Za-z0-9_]+$/', $table)) {
            throw new RuntimeException('Invalid table name.');
        }

        $driver = $this->driver($config);
        $pdo = $this->connect($config);
        $sql = $this->selectWithLimit($driver, $this->quoteIdentifier($driver, $table), self::MAX_ROWS);

        return $this->ingestFromPdo($dataSource, $pdo, $sql, $table, $existing);
    }

    public function ingestQuery(DataSource $dataSource, string $query, string $name = 'query_result', ?Dataset $existing = null): Dataset
    {
        $config = $dataSource->config ?? [];

        foreach (['host', 'database', 'username'] as $key) {
            if (empty($config[$key])) {
                throw new RuntimeException("Missing required database config field: {$key}");
            }
        }

        $query = $this->validateSelectQuery($query);

        $driver = $this->driver($config);
        $pdo = $this->connect($config);
        $sql = $this->selectWithLimit($driver, "({$query}\n) AS query_result", self::MAX_ROWS);

        return $this->ingestFromPdo($dataSource, $pdo, $sql, $name, $existing);
    }

    /**
     * Run an ad-hoc SELECT against a data source's stored connection without
     * persisting anything — used by the notebook/query workbench.
     *
     * @return array{columns: string[], rows: array<int, array<string, mixed>>}
     */
    public function previewQuery(DataSource $dataSource, string $query, int $limit = 100): array
    {
        $config = $dataSource->config ?? [];

        foreach (['host', 'database', 'username'] as $key) {
            if (empty($config[$key])) {
                throw new RuntimeException("Missing required database config field: {$key}");
            }
        }

        $query = $this->validateSelectQuery($query);

        $driver = $this->driver($config);
        $pdo = $this->connect($config);
        $sql = $this->selectWithLimit($driver, "({$query}\n) AS query_result", max(1, min($limit, self::MAX_ROWS)));

        $statement = $pdo->query($sql);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
        $rows = array_map(fn (array $row) => $this->castRow($row), $rows);

        return [
            'columns' => $rows === [] ? [] : array_keys($rows[0]),
            'rows' => $rows,
        ];
    }

    /**
     * List every table and its columns in the data source's configured
     * database, so users can see what's available without guessing table
     * names blind before writing a query.
     *
     * @return array<int, array{table: string, columns: string[]}>
     */
    public function listSchema(DataSource $dataSource): array
    {
        $config = $dataSource->config ?? [];
        $driver = $this->driver($config);
        $pdo = $this->connect($config);

        $statement = $pdo->prepare(
            'SELECT table_name, column_name FROM information_schema.columns
             WHERE table_schema = ? ORDER BY table_name, ordinal_position'
        );
        $statement->execute([$this->schemaFilter($driver, $config)]);

        $tables = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $tables[$row['table_name']][] = $row['column_name'];
        }

        return collect($tables)
            ->map(fn ($columns, $table) => ['table' => $table, 'columns' => $columns])
            ->values()
            ->all();
    }

    /**
     * Preview raw rows from a table in the data source's database, without
     * ingesting anything — lets a user look at a table before deciding
     * whether to import it. `$table` is validated against the database's
     * actual table list (not just regex-shaped) since identifiers can't be
     * parameterized in SQL.
     *
     * @return array{columns: string[], rows: array<int, array<string, mixed>>}
     */
    public function previewTable(DataSource $dataSource, string $table, int $limit = 25): array
    {
        $config = $dataSource->config ?? [];
        $driver = $this->driver($config);
        $pdo = $this->connect($config);

        $exists = $pdo->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?');
        $exists->execute([$this->schemaFilter($driver, $config), $table]);
        if (! $exists->fetchColumn()) {
            throw new RuntimeException("Table \"{$table}\" does not exist in this database.");
        }

        $sql = $this->selectWithLimit($driver, $this->quoteIdentifier($driver, $table), max(1, min($limit, 100)));
        $statement = $pdo->query($sql);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
        $rows = array_map(fn (array $row) => $this->castRow($row), $rows);

        return [
            'columns' => $rows === [] ? [] : array_keys($rows[0]),
            'rows' => $rows,
        ];
    }

    /**
     * A generic connector: fetch a JSON endpoint, pull the array of records out of it (either
     * the whole response, or a dot-path into it), flatten each record's nested objects into
     * dot-notation columns, and ingest exactly like a CSV/table row.
     */
    public function ingestRestApi(DataSource $dataSource, ?Dataset $existing = null): Dataset
    {
        $config = $dataSource->config ?? [];

        if (empty($config['url'])) {
            throw new RuntimeException('Missing required field: url.');
        }

        $records = $this->fetchRestApiRecords($config);

        if ($existing) {
            $existing->rows()->delete();
        }

        $header = null;
        $dataset = null;
        $rowCount = 0;
        $chunk = [];
        $name = $config['name'] ?? 'api_data';

        foreach ($records as $record) {
            if ($rowCount >= self::MAX_ROWS) {
                break;
            }

            if (! is_array($record)) {
                continue;
            }

            $flat = $this->flattenRecord($record);

            if ($header === null) {
                $header = array_keys($flat);
                $dataset = $this->putDataset($dataSource, $existing, $name, $this->buildColumnMeta($header));
            }

            $chunk[] = [
                'dataset_id' => $dataset->id,
                'data' => json_encode($this->castRow($flat)),
                'created_at' => now(),
                'updated_at' => now(),
            ];
            $rowCount++;

            if (count($chunk) >= self::CHUNK_SIZE) {
                DB::table('dataset_rows')->insert($chunk);
                $chunk = [];
            }
        }

        if ($dataset === null) {
            $dataset = $this->putDataset($dataSource, $existing, $name, []);
        }

        if (! empty($chunk)) {
            DB::table('dataset_rows')->insert($chunk);
        }

        $dataset->update(['row_count' => $rowCount]);

        return $dataset;
    }

    /**
     * Runs the configured request and pulls out the array of records — either the whole JSON
     * response (if it's already a list) or a dot-path into it (e.g. "data.results"), the same
     * way most REST APIs wrap their actual payload in an envelope.
     */
    protected function fetchRestApiRecords(array $config): array
    {
        $method = strtoupper($config['method'] ?? 'GET');
        $headers = [];

        foreach ($config['headers'] ?? [] as $header) {
            if (! empty($header['key'])) {
                $headers[$header['key']] = $header['value'] ?? '';
            }
        }

        $request = Http::withHeaders($headers)->timeout(30);

        $authType = $config['auth_type'] ?? 'none';
        if ($authType === 'bearer' && ! empty($config['auth_token'])) {
            $request = $request->withToken($config['auth_token']);
        } elseif ($authType === 'basic' && ! empty($config['basic_username'])) {
            $request = $request->withBasicAuth($config['basic_username'], $config['basic_password'] ?? '');
        } elseif ($authType === 'api_key' && ! empty($config['auth_token'])) {
            $request = $request->withHeaders([($config['auth_header_name'] ?: 'X-API-Key') => $config['auth_token']]);
        }

        $response = $method === 'POST'
            ? $request->post($config['url'], $this->decodeJsonBody($config['body'] ?? null))
            : $request->get($config['url']);

        if (! $response->successful()) {
            throw new RuntimeException("API request failed with status {$response->status()}: ".$response->body());
        }

        $json = $response->json();
        $path = trim((string) ($config['json_path'] ?? ''));

        if ($path !== '') {
            foreach (explode('.', $path) as $segment) {
                if (! is_array($json) || ! array_key_exists($segment, $json)) {
                    throw new RuntimeException("JSON path \"{$path}\" not found in the response.");
                }
                $json = $json[$segment];
            }
        }

        if (! is_array($json)) {
            throw new RuntimeException('The response at the given JSON path is not an array of records.');
        }

        return array_values($json);
    }

    protected function decodeJsonBody(?string $body): array
    {
        if (! $body) {
            return [];
        }

        return json_decode($body, true) ?? [];
    }

    /**
     * A nested object becomes dot-notation columns (user.name, user.id); a nested list is
     * stringified rather than expanded, since its length can vary row to row and a dataset needs
     * a fixed column set.
     */
    protected function flattenRecord(array $record, string $prefix = ''): array
    {
        $flat = [];

        foreach ($record as $key => $value) {
            $flatKey = $prefix === '' ? (string) $key : "{$prefix}.{$key}";

            if (is_array($value) && $value !== [] && array_keys($value) !== range(0, count($value) - 1)) {
                $flat = array_merge($flat, $this->flattenRecord($value, $flatKey));
            } elseif (is_array($value)) {
                $flat[$flatKey] = json_encode($value);
            } else {
                $flat[$flatKey] = $value;
            }
        }

        return $flat;
    }

    protected function driver(array $config): string
    {
        return $config['driver'] ?? 'mysql';
    }

    protected function connect(array $config): PDO
    {
        $driver = $this->driver($config);
        $port = $config['port'] ?? self::DEFAULT_PORTS[$driver] ?? 3306;

        $dsn = match ($driver) {
            'postgres' => "pgsql:host={$config['host']};port={$port};dbname={$config['database']}",
            'sqlserver' => "sqlsrv:Server={$config['host']},{$port};Database={$config['database']}",
            default => "mysql:host={$config['host']};port={$port};dbname={$config['database']};charset=utf8mb4",
        };

        return new PDO($dsn, $config['username'], $config['password'] ?? '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 10,
        ]);
    }

    /**
     * MySQL conflates "database" and "schema" (table_schema = the database name itself), but
     * Postgres and SQL Server both scope information_schema.columns by a separate schema name
     * within the connected database — 'public' and 'dbo' are each engine's sane single-schema
     * default, matching how a BI tool's first-pass connection is expected to be set up.
     */
    protected function schemaFilter(string $driver, array $config): string
    {
        return match ($driver) {
            'postgres' => 'public',
            'sqlserver' => 'dbo',
            default => $config['database'],
        };
    }

    protected function quoteIdentifier(string $driver, string $identifier): string
    {
        return match ($driver) {
            'postgres' => '"'.str_replace('"', '""', $identifier).'"',
            'sqlserver' => '['.str_replace(']', ']]', $identifier).']',
            default => '`'.str_replace('`', '``', $identifier).'`',
        };
    }

    /**
     * SQL Server has no LIMIT clause (pre-2012 compatible, and TOP needs no ORDER BY unlike
     * OFFSET/FETCH) — MySQL and Postgres both support LIMIT identically.
     */
    protected function selectWithLimit(string $driver, string $fromExpr, int $limit): string
    {
        return $driver === 'sqlserver'
            ? "SELECT TOP {$limit} * FROM {$fromExpr}"
            : "SELECT * FROM {$fromExpr} LIMIT {$limit}";
    }

    /**
     * Only single SELECT statements are allowed. The data source's own DB
     * credentials already bound what it can reach; this guard exists to
     * catch accidental destructive queries (typos), not hostile input.
     */
    /**
     * @return string The query with any trailing semicolon/whitespace stripped —
     *                 callers must use this return value (not their original
     *                 input) when building the wrapping subquery, since a
     *                 trailing ";" would otherwise break "SELECT * FROM (...) AS query_result".
     */
    protected function validateSelectQuery(string $query): string
    {
        $trimmed = trim($query);
        $trimmed = rtrim($trimmed, "; \t\n\r");

        // Comments can't execute, so strip them before every check below —
        // otherwise ordinary English in a comment (e.g. "replace with your
        // own query") can false-positive against the checks meant to catch
        // actual executable SQL. The original (with comments) is still what
        // gets sent to MySQL, which handles comments natively.
        $withoutComments = preg_replace('/--[^\n]*|\/\*.*?\*\//s', '', $trimmed) ?? $trimmed;

        if (str_contains($withoutComments, ';')) {
            throw new RuntimeException('Only a single SELECT statement is allowed.');
        }

        if (! preg_match('/^\s*SELECT\s/i', $withoutComments)) {
            throw new RuntimeException('Query must start with SELECT.');
        }

        // A few of these are engine-specific (INTO OUTFILE is MySQL, COPY/OPENROWSET etc. are
        // Postgres/SQL Server) — harmless to check for all of them regardless of which engine
        // the query is actually headed to, since a keyword that doesn't apply just never matches.
        $forbidden = [
            'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE',
            'REPLACE', 'MERGE', 'CALL', 'EXEC', 'EXECUTE', 'BULK', 'COPY', 'OPENROWSET', 'OPENQUERY',
            'INTO OUTFILE',
        ];
        foreach ($forbidden as $keyword) {
            if (preg_match('/\b' . preg_quote($keyword, '/') . '\b/i', $withoutComments)) {
                throw new RuntimeException("Query must not contain {$keyword}.");
            }
        }

        return $trimmed;
    }

    /**
     * @param  Dataset|null  $existing  When given, rows/columns are replaced on this same dataset
     *                                  record instead of creating a new one — keeping its ID stable
     *                                  so charts already built from it (charts.dataset_id cascades
     *                                  on delete) survive a resync/edit instead of being destroyed.
     */
    protected function ingestFromPdo(DataSource $dataSource, PDO $pdo, string $sql, string $datasetName, ?Dataset $existing = null): Dataset
    {
        $statement = $pdo->query($sql);
        $header = null;
        $dataset = null;
        $rowCount = 0;
        $chunk = [];

        if ($existing) {
            $existing->rows()->delete();
        }

        while ($record = $statement->fetch(PDO::FETCH_ASSOC)) {
            if ($header === null) {
                $header = array_keys($record);
                $dataset = $this->putDataset($dataSource, $existing, $datasetName, $this->buildColumnMeta($header));
            }

            $chunk[] = [
                'dataset_id' => $dataset->id,
                'data' => json_encode($this->castRow($record)),
                'created_at' => now(),
                'updated_at' => now(),
            ];
            $rowCount++;

            if (count($chunk) >= self::CHUNK_SIZE) {
                DB::table('dataset_rows')->insert($chunk);
                $chunk = [];
            }
        }

        if ($dataset === null) {
            $dataset = $this->putDataset($dataSource, $existing, $datasetName, []);
        }

        if (! empty($chunk)) {
            DB::table('dataset_rows')->insert($chunk);
        }

        $dataset->update(['row_count' => $rowCount]);

        return $dataset;
    }

    /**
     * @param  array<int, array{name: string, label: string}>  $columns
     */
    protected function putDataset(DataSource $dataSource, ?Dataset $existing, string $name, array $columns): Dataset
    {
        if ($existing) {
            $existing->update(['name' => $name, 'columns' => $columns, 'row_count' => 0]);

            return $existing;
        }

        return Dataset::create([
            'data_source_id' => $dataSource->id,
            'name' => $name,
            'columns' => $columns,
            'row_count' => 0,
        ]);
    }

    protected function buildColumnMeta(array $header): array
    {
        return array_map(fn (string $name) => [
            'name' => $name,
            'label' => $name,
        ], $header);
    }

    protected function castRow(array $record): array
    {
        return array_map(function ($value) {
            if ($value === null || $value === '') {
                return $value;
            }

            if (is_numeric($value)) {
                return str_contains((string) $value, '.') ? (float) $value : (int) $value;
            }

            return (string) $value;
        }, $record);
    }
}
