import { SetMetadata } from "@nestjs/common";

export const IS_OPTIONAL_AUTH_ROUTE = "dealse:is-optional-auth-route";
export const OptionalAuthRoute = () => SetMetadata(IS_OPTIONAL_AUTH_ROUTE, true);
