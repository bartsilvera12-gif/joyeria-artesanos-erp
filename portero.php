<?php
/**
 * Portero de joyeriaartesanos.com (Hostinger).
 *
 * El .htaccess manda acá cada página .html de public/web/. El portero pregunta
 * a sistemas.neura.com.py si este dominio está bloqueado (pestaña "Acceso" del
 * proyecto, botón Bloquear / Desbloquear):
 *   - bloqueado → 503 con public/web/mantenimiento.html
 *   - si no     → entrega la página pedida tal cual
 *
 * La respuesta se guarda 60 s. Si el sistema de Neura no responde, se usa el
 * último estado conocido (o se deja pasar): un corte nuestro nunca baja el sitio.
 * Imágenes, CSS y JS no pasan por acá.
 */

// Un aviso de PHP impreso antes de los headers haría perder el 503.
ini_set('display_errors', '0');

const ACCESO_URL = 'https://sistemas.neura.com.py/api/public/acceso-sistema';
const VIGENCIA_S = 60;
const REINTENTO_S = 15;
const TIMEOUT_S = 3;

$base = realpath(__DIR__ . '/public/web');
$pedido = isset($_GET['archivo']) ? (string) $_GET['archivo'] : '';
$ruta = $pedido !== '' ? realpath(__DIR__ . '/' . $pedido) : false;

if (
    $base === false
    || $ruta === false
    || strpos($ruta, $base . DIRECTORY_SEPARATOR) !== 0
    || !preg_match('/\.html$/i', $ruta)
    || !is_file($ruta)
) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'No encontrado';
    exit;
}

if (portero_bloqueado(portero_host())) {
    http_response_code(503);
    header('Retry-After: 86400');
    header('Cache-Control: no-store');
    header('Content-Type: text/html; charset=utf-8');
    readfile($base . '/mantenimiento.html');
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
readfile($ruta);
exit;

function portero_host(): string
{
    $h = strtolower(trim(explode(',', $_SERVER['HTTP_HOST'] ?? '')[0]));
    $h = preg_replace('/:\d+$/', '', $h);
    return preg_replace('/^www\./', '', $h);
}

function portero_bloqueado(string $host): bool
{
    if ($host === '' || $host === 'localhost' || filter_var($host, FILTER_VALIDATE_IP)) {
        return false;
    }

    $archivo = rtrim(sys_get_temp_dir(), '/') . '/neura-portero-' . md5($host) . '.json';
    $cache = @json_decode((string) @file_get_contents($archivo), true);
    if (is_array($cache) && ($cache['hasta'] ?? 0) > time()) {
        return !empty($cache['bloqueado']);
    }
    $anterior = is_array($cache) && !empty($cache['bloqueado']);

    $respuesta = portero_consultar(ACCESO_URL . '?host=' . rawurlencode($host));
    if (is_array($respuesta) && array_key_exists('bloqueado', $respuesta)) {
        $bloqueado = $respuesta['bloqueado'] === true;
        @file_put_contents($archivo, json_encode(['bloqueado' => $bloqueado, 'hasta' => time() + VIGENCIA_S]), LOCK_EX);
        return $bloqueado;
    }

    @file_put_contents($archivo, json_encode(['bloqueado' => $anterior, 'hasta' => time() + REINTENTO_S]), LOCK_EX);
    return $anterior;
}

/** GET con cURL si está, si no con file_get_contents. `null` si no hubo 200 con JSON. */
function portero_consultar(string $url): ?array
{
    $ua = 'neura-portero/1.0';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => TIMEOUT_S,
            CURLOPT_CONNECTTIMEOUT => TIMEOUT_S,
            CURLOPT_USERAGENT => $ua,
        ]);
        $cuerpo = curl_exec($ch);
        $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    } else {
        $ctx = stream_context_create(['http' => ['timeout' => TIMEOUT_S, 'ignore_errors' => true, 'header' => "User-Agent: $ua\r\n"]]);
        $cuerpo = @file_get_contents($url, false, $ctx);
        $codigo = 0;
        foreach ($http_response_header ?? [] as $linea) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $linea, $m)) {
                $codigo = (int) $m[1];
            }
        }
    }
    if ($codigo !== 200 || !is_string($cuerpo)) {
        return null;
    }
    $json = json_decode($cuerpo, true);
    return is_array($json) ? $json : null;
}
