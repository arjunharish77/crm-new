export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        total: number;
        page: number;
        last_page: number;
        limit: number;
    };
}

export interface ApiError {
    message: string;
    statusCode: number;
    error: string;
}
