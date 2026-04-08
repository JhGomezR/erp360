<?php
namespace App\Tenant\Expenses\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Expense extends Model
{
    use SoftDeletes;

    protected $table = 'expenses';

    protected $fillable = [
        'expense_number','category_id','supplier_id','expense_date','description',
        'amount','tax','total','payment_method','reference','cost_center',
        'attachment_url','status','notes','created_by','approved_by','approved_at',
    ];

    protected $casts = [
        'expense_date' => 'date',
        'approved_at'  => 'datetime',
        'amount'       => 'float',
        'tax'          => 'float',
        'total'        => 'float',
    ];

    public function category()
    {
        return $this->belongsTo(ExpenseCategory::class);
    }

    public function supplier()
    {
        return $this->belongsTo(\App\Tenant\Purchases\Models\Supplier::class);
    }

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            if (empty($m->expense_number)) {
                $last = static::withTrashed()->max('id') ?? 0;
                $m->expense_number = 'GAS-' . str_pad($last + 1, 6, '0', STR_PAD_LEFT);
            }
        });
    }
}
