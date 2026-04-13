<?php

namespace App\Central\Legal\Requests;

use App\Central\Legal\Models\LegalDocument;
use Illuminate\Foundation\Http\FormRequest;

class UpdateLegalDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // El controller aplica middleware role:super
    }

    public function rules(): array
    {
        return [
            'type'           => ['sometimes', 'string', 'in:' . implode(',', LegalDocument::TYPES)],
            'title'          => ['sometimes', 'string', 'max:255'],
            'content'        => ['sometimes', 'string', 'min:10'],
            'version'        => ['sometimes', 'string', 'max:20', 'regex:/^[\d\w.\-]+$/'],
            'language'       => ['sometimes', 'string', 'size:2'],
            'status'         => ['sometimes', 'string', 'in:draft,published'],
            'effective_date' => ['nullable', 'date'],
        ];
    }

    public function messages(): array
    {
        return [
            'type.in'       => 'Tipo de documento no válido. Valores permitidos: ' . implode(', ', LegalDocument::TYPES),
            'version.regex' => 'La versión solo puede contener letras, números, puntos y guiones.',
            'language.size' => 'El idioma debe ser un código ISO de 2 caracteres (ej: es, en).',
        ];
    }
}
