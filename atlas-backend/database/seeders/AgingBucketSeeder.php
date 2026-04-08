<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AgingBucketSeeder extends Seeder
{
    public function run(): void
    {
        $buckets = [
            [
                'name'       => '0 - 30 dias',
                'from_days'  => 0,
                'to_days'    => 30,
                'color'      => '#22c55e',  // verde - corriente
                'label'      => 'Corriente',
                'sort_order' => 1,
                'is_active'  => true,
            ],
            [
                'name'       => '31 - 60 dias',
                'from_days'  => 31,
                'to_days'    => 60,
                'color'      => '#f59e0b',  // amarillo - atencion
                'label'      => 'Atencion',
                'sort_order' => 2,
                'is_active'  => true,
            ],
            [
                'name'       => '61 - 90 dias',
                'from_days'  => 61,
                'to_days'    => 90,
                'color'      => '#f97316',  // naranja - vencido
                'label'      => 'Vencido',
                'sort_order' => 3,
                'is_active'  => true,
            ],
            [
                'name'       => 'Mas de 90 dias',
                'from_days'  => 91,
                'to_days'    => null,       // sin limite superior
                'color'      => '#ef4444',  // rojo - critico
                'label'      => 'Critico',
                'sort_order' => 4,
                'is_active'  => true,
            ],
        ];

        foreach ($buckets as $bucket) {
            DB::table('aging_buckets')->updateOrInsert(
                ['name' => $bucket['name']],
                array_merge($bucket, [
                    'created_at' => now(),
                    'updated_at' => now(),
                ])
            );
        }

        $this->command?->info('Aging buckets sembrados: ' . count($buckets) . ' rangos.');
    }
}
