<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Adds missing FK constraints and softDeletes columns to several tenant tables.
 *
 * Each operation runs in its own savepoint so a single failure does not abort
 * the entire migration on PostgreSQL (which kills the whole transaction on error).
 */
return new class extends Migration
{
    // ------------------------------------------------------------------
    // Check FK existence (PostgreSQL + MySQL)
    // ------------------------------------------------------------------
    private function fkExists(string $table, string $name): bool
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            return (bool) DB::selectOne(
                "SELECT 1 FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass",
                [$name, $table]
            );
        }
        $db = Schema::getConnection()->getDatabaseName();
        return DB::table('information_schema.KEY_COLUMN_USAGE')
            ->where('TABLE_SCHEMA', $db)->where('TABLE_NAME', $table)
            ->where('CONSTRAINT_NAME', $name)->exists();
    }

    private function idxExists(string $table, string $name): bool
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            return (bool) DB::selectOne(
                "SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ?",
                [$table, $name]
            );
        }
        $db = Schema::getConnection()->getDatabaseName();
        return DB::table('information_schema.STATISTICS')
            ->where('TABLE_SCHEMA', $db)->where('TABLE_NAME', $table)
            ->where('INDEX_NAME', $name)->exists();
    }

    // ------------------------------------------------------------------
    // Run one DDL closure inside its own savepoint so errors are contained
    // ------------------------------------------------------------------
    private function safeRun(string $label, \Closure $fn): void
    {
        $isPgsql = Schema::getConnection()->getDriverName() === 'pgsql';
        $sp      = 'sp_' . preg_replace('/\W+/', '_', $label);

        try {
            if ($isPgsql) {
                DB::statement("SAVEPOINT {$sp}");
            }
            $fn();
            if ($isPgsql) {
                DB::statement("RELEASE SAVEPOINT {$sp}");
            }
        } catch (\Throwable $e) {
            if ($isPgsql) {
                DB::statement("ROLLBACK TO SAVEPOINT {$sp}");
            }
            Log::warning("add_missing_fk [{$label}]: " . $e->getMessage());
        }
    }

    // ==================================================================
    public function up(): void
    {
        // 1. sale_items softDeletes
        $this->safeRun('sale_items_soft', function () {
            if (!Schema::hasColumn('sale_items', 'deleted_at')) {
                Schema::table('sale_items', fn (Blueprint $t) => $t->softDeletes());
            }
        });

        // 2. sale_items FK
        $this->safeRun('fk_sale_items_product_id', function () {
            if (!$this->fkExists('sale_items', 'fk_sale_items_product_id')) {
                Schema::table('sale_items', function (Blueprint $t) {
                    $t->foreign('product_id', 'fk_sale_items_product_id')
                      ->references('id')->on('products')->restrictOnDelete();
                });
            }
        });

        // 3. purchase_order_items softDeletes
        $this->safeRun('poi_soft', function () {
            if (!Schema::hasColumn('purchase_order_items', 'deleted_at')) {
                Schema::table('purchase_order_items', fn (Blueprint $t) => $t->softDeletes());
            }
        });

        // 4. purchase_order_items FK
        $this->safeRun('fk_poi_product_id', function () {
            if (!$this->fkExists('purchase_order_items', 'fk_poi_product_id')) {
                Schema::table('purchase_order_items', function (Blueprint $t) {
                    $t->foreign('product_id', 'fk_poi_product_id')
                      ->references('id')->on('products')->restrictOnDelete();
                });
            }
        });

        // 5. kardex_entries polimorphic index
        $this->safeRun('kardex_reference_idx', function () {
            if (!$this->idxExists('kardex_entries', 'kardex_reference_idx')) {
                Schema::table('kardex_entries', function (Blueprint $t) {
                    $t->index(['reference_type', 'reference_id'], 'kardex_reference_idx');
                });
            }
        });

        // 6. sales.user_id
        $this->safeRun('fk_sales_user_id', function () {
            if (!$this->fkExists('sales', 'fk_sales_user_id')) {
                Schema::table('sales', function (Blueprint $t) {
                    $t->foreign('user_id', 'fk_sales_user_id')
                      ->references('id')->on('tenant_users')->nullOnDelete();
                });
            }
        });

        // 7. purchase_orders.user_id
        $this->safeRun('fk_po_user_id', function () {
            if (!$this->fkExists('purchase_orders', 'fk_po_user_id')) {
                Schema::table('purchase_orders', function (Blueprint $t) {
                    $t->foreign('user_id', 'fk_po_user_id')
                      ->references('id')->on('tenant_users')->nullOnDelete();
                });
            }
        });

        // 8. product_warehouse_stock.product_id
        $this->safeRun('fk_pws_product_id', function () {
            if (!$this->fkExists('product_warehouse_stock', 'fk_pws_product_id')) {
                Schema::table('product_warehouse_stock', function (Blueprint $t) {
                    $t->foreign('product_id', 'fk_pws_product_id')
                      ->references('id')->on('products')->cascadeOnDelete();
                });
            }
        });

        // 9. product_warehouse_stock.warehouse_id
        $this->safeRun('fk_pws_warehouse_id', function () {
            if (!$this->fkExists('product_warehouse_stock', 'fk_pws_warehouse_id')) {
                Schema::table('product_warehouse_stock', function (Blueprint $t) {
                    $t->foreign('warehouse_id', 'fk_pws_warehouse_id')
                      ->references('id')->on('warehouses')->cascadeOnDelete();
                });
            }
        });

        // 10. journal_entries.created_by (make nullable + FK)
        $this->safeRun('fk_je_created_by', function () {
            if (!$this->fkExists('journal_entries', 'fk_je_created_by')) {
                Schema::table('journal_entries', function (Blueprint $t) {
                    $t->unsignedBigInteger('created_by')->nullable()->change();
                    $t->foreign('created_by', 'fk_je_created_by')
                      ->references('id')->on('tenant_users')->nullOnDelete();
                });
            }
        });

        // 11. journal_entries.posted_by
        $this->safeRun('fk_je_posted_by', function () {
            if (!$this->fkExists('journal_entries', 'fk_je_posted_by')) {
                Schema::table('journal_entries', function (Blueprint $t) {
                    $t->foreign('posted_by', 'fk_je_posted_by')
                      ->references('id')->on('tenant_users')->nullOnDelete();
                });
            }
        });
    }

    // ==================================================================
    public function down(): void
    {
        $drops = [
            ['journal_entries',         'fk_je_posted_by'],
            ['journal_entries',         'fk_je_created_by'],
            ['product_warehouse_stock', 'fk_pws_warehouse_id'],
            ['product_warehouse_stock', 'fk_pws_product_id'],
            ['purchase_orders',         'fk_po_user_id'],
            ['sales',                   'fk_sales_user_id'],
            ['purchase_order_items',    'fk_poi_product_id'],
            ['sale_items',              'fk_sale_items_product_id'],
        ];

        foreach ($drops as [$table, $constraint]) {
            $this->safeRun("drop_{$constraint}", function () use ($table, $constraint) {
                Schema::table($table, fn (Blueprint $t) => $t->dropForeign($constraint));
            });
        }

        foreach (['sale_items', 'purchase_order_items'] as $table) {
            $this->safeRun("drop_soft_{$table}", function () use ($table) {
                if (Schema::hasColumn($table, 'deleted_at')) {
                    Schema::table($table, fn (Blueprint $t) => $t->dropSoftDeletes());
                }
            });
        }

        $this->safeRun('drop_kardex_idx', function () {
            if ($this->idxExists('kardex_entries', 'kardex_reference_idx')) {
                Schema::table('kardex_entries', fn (Blueprint $t) => $t->dropIndex('kardex_reference_idx'));
            }
        });
    }
};
