<?php

namespace Database\Factories;

use App\Models\DataSource;
use Illuminate\Database\Eloquent\Factories\Factory;

class DatasetFactory extends Factory
{
    public function definition(): array
    {
        return [
            'data_source_id' => DataSource::factory(),
            'name' => fake()->word(),
            'columns' => [],
            'row_count' => 0,
        ];
    }
}
