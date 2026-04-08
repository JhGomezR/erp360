<?php

namespace App\Tenant\Banking\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BankReconciliationMatch extends Model
{
    protected $table = 'bank_reconciliation_matches';

    protected $fillable = [
        'reconciliation_id', 'statement_line_id', 'source_type',
        'source_id', 'source_description', 'matched_amount', 'match_type',
    ];

    protected $casts = [
        'matched_amount' => 'float',
    ];

    public function reconciliation(): BelongsTo
    {
        return $this->belongsTo(BankReconciliation::class);
    }

    public function statementLine(): BelongsTo
    {
        return $this->belongsTo(BankStatementLine::class, 'statement_line_id');
    }
}
