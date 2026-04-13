from fastapi import HTTPException, status


class AppException(HTTPException):
    def __init__(self, status_code: int, error_code: str, message: str):
        super().__init__(status_code=status_code, detail={"error_code": error_code, "message": message})


class NotFoundError(AppException):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(status.HTTP_404_NOT_FOUND, "NOT_FOUND", message)


class ForbiddenError(AppException):
    def __init__(self, message: str = "Forbidden"):
        super().__init__(status.HTTP_403_FORBIDDEN, "FORBIDDEN", message)


class BadRequestError(AppException):
    def __init__(self, message: str = "Bad request"):
        super().__init__(status.HTTP_400_BAD_REQUEST, "BAD_REQUEST", message)


class ConflictError(AppException):
    def __init__(self, message: str = "Conflict"):
        super().__init__(status.HTTP_409_CONFLICT, "CONFLICT", message)


class UnauthorizedError(AppException):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", message)
