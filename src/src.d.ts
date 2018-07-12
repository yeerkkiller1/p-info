declare module "table-parser" {
    function parse<T extends { [key in keyof T]: string }>(text: string): T[];
}