<?php

namespace Database\Seeders;

use App\Services\GraphImporter;
use Illuminate\Database\Seeder;

/** Seeds every database/seeders/data/*.json floor file, then links floors. */
class GraphSeeder extends Seeder
{
    public function run(GraphImporter $importer): void
    {
        $buildings = [];
        foreach (glob(database_path('seeders/data/*.json')) as $file) {
            $buildings[] = $importer->importFloor(json_decode(file_get_contents($file), true, flags: JSON_THROW_ON_ERROR));
        }
        foreach (array_unique($buildings) as $id) {
            $importer->linkFloors($id);
        }
    }
}
