export interface CompileOptions {
  maxBytes?: number;
  onOversize?: 'error' | 'warn';
  minify?: boolean;
  define?: Record<string, string>;
}

export interface CompiledCritical {
  code: string;
  bytes: number;
  hash: string;
  warnings: string[];
}

export interface CriticalModule {
  code: string;
  hash: string;
  bytes: number;
}
