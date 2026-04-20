package com.bwstatsapi.util;

import java.util.List;
import java.util.Map;

/**
 * Minimal, dependency-free JSON serialiser.
 * Supports String, Number, Boolean, null, Map, List recursively.
 */
public final class JsonBuilder {

    private JsonBuilder() {}

    public static String toJson(Object value) {
        if (value == null)                    return "null";
        if (value instanceof Boolean)         return value.toString();
        if (value instanceof Number)          return value.toString();
        if (value instanceof String)          return quote((String) value);
        if (value instanceof Map)             return mapToJson((Map<?, ?>) value);
        if (value instanceof List)            return listToJson((List<?>) value);
        return quote(value.toString());
    }

    private static String mapToJson(Map<?, ?> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<?, ?> e : map.entrySet()) {
            if (!first) sb.append(",");
            sb.append(quote(e.getKey().toString()))
              .append(":")
              .append(toJson(e.getValue()));
            first = false;
        }
        return sb.append("}").toString();
    }

    private static String listToJson(List<?> list) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (Object item : list) {
            if (!first) sb.append(",");
            sb.append(toJson(item));
            first = false;
        }
        return sb.append("]").toString();
    }

    private static String quote(String s) {
        return "\"" + s
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
            + "\"";
    }

    /** Convenience: wrap a success payload */
    public static String success(Map<String, Object> data) {
        data.put("success", true);
        return toJson(data);
    }

    /** Convenience: produce an error JSON string */
    public static String error(int code, String message) {
        return "{\"success\":false,\"error\":{\"code\":" + code + ",\"message\":" + quote(message) + "}}";
    }
}
