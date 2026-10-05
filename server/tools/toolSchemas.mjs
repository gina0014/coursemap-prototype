/* ============================================================================
   CourseMap AI Backend — tools/toolSchemas.mjs
   ----------------------------------------------------------------------------
   DeepSeek Tool Calling 的工具定义（JSON Schema）。
   工具是 allowlist：模型只能调用这里声明的工具，禁止任意 URL / shell / FS。
   ========================================================================== */

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'search_learning_resources',
      description: 'Search CourseMap learning resources by goal text and constraints. Returns resources that EXIST in CourseMap only.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Learning goal phrase' },
          level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
          budget: { type: ['number', 'null'], description: 'Max fee in CNY' },
          hours_per_week: { type: ['number', 'null'] },
          language: { type: ['string', 'null'], enum: ['zh', 'en', 'bilingual'] },
          certificate: { type: ['boolean', 'null'] },
          resource_type: { type: ['string', 'null'] },
        },
        required: ['goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_resource_detail',
      description: 'Get full detail of one CourseMap resource by resource_id.',
      parameters: {
        type: 'object',
        properties: { resource_id: { type: 'string' } },
        required: ['resource_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_learning_resources',
      description: 'Compare 2-6 CourseMap resources by id. All derived values computed by CourseMap code, not by the model.',
      parameters: {
        type: 'object',
        properties: {
          resource_ids: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
        },
        required: ['resource_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_learning_path',
      description: 'Get a CourseMap learning path (goal → prerequisites → steps → resources) by path_id, or list paths for a goal.',
      parameters: {
        type: 'object',
        properties: {
          path_id: { type: ['string', 'null'] },
          goal: { type: ['string', 'null'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_prerequisites',
      description: 'Get prerequisite goals and skills for a CourseMap goal.',
      parameters: {
        type: 'object',
        properties: { goal: { type: 'string' } },
        required: ['goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_source_evidence',
      description: 'Get data source provenance for a resource (where its facts come from, observed dates, verification).',
      parameters: {
        type: 'object',
        properties: { resource_id: { type: 'string' } },
        required: ['resource_id'],
      },
    },
  },
];

export const TOOL_NAMES = new Set(TOOL_SCHEMAS.map((t) => t.function.name));
