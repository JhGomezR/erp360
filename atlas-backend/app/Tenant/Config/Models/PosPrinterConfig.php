<?php
namespace App\Tenant\Config\Models;

use Illuminate\Database\Eloquent\Model;

class PosPrinterConfig extends Model
{
    protected $table = 'pos_printer_configs';

    protected $fillable = [
        'name','printer_type','connection_type','host','port','serial_port','baud_rate',
        'paper_width','cut_paper','open_drawer','print_logo','header_text','footer_text',
        'is_default','is_active',
    ];

    protected $casts = [
        'port'        => 'integer',
        'baud_rate'   => 'integer',
        'paper_width' => 'integer',
        'cut_paper'   => 'boolean',
        'open_drawer' => 'boolean',
        'print_logo'  => 'boolean',
        'is_default'  => 'boolean',
        'is_active'   => 'boolean',
    ];
}
