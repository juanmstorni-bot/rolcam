// rolcam-camara: programa auxiliar mínimo de la cámara virtual de RolCam.
//
// RolCam lo arranca y le manda por la entrada estándar los cuadros del personaje
// (RGBA, de arriba hacia abajo). Este programa los pasa a la cámara virtual
// (Softcam, licencia MIT), que Discord y otras apps ven como una webcam.
//
// Uso: rolcam-camara.exe <ancho> <alto>      (ancho y alto múltiplos de 4)
// Por la salida de errores informa: "LISTO", o "ERROR <motivo>".
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <vector>
#include <io.h>
#include <fcntl.h>
#include <softcam/softcam.h>

int main(int argc, char** argv)
{
    const int ancho = argc > 1 ? std::atoi(argv[1]) : 1280;
    const int alto = argc > 2 ? std::atoi(argv[2]) : 720;
    if (ancho <= 0 || alto <= 0 || ancho % 4 != 0 || alto % 4 != 0 || ancho > 3840 || alto > 2160)
    {
        std::fprintf(stderr, "ERROR tamano\n");
        return 2;
    }

    _setmode(_fileno(stdin), _O_BINARY);

    // Framerate 0: cada cuadro se entrega apenas llega (el ritmo lo marca RolCam).
    scCamera camara = scCreateCamera(ancho, alto, 0.0f);
    if (!camara)
    {
        // Falla si ya hay otra instancia usando la cámara virtual.
        std::fprintf(stderr, "ERROR ocupada\n");
        std::fflush(stderr);
        return 3;
    }
    std::fprintf(stderr, "LISTO\n");
    std::fflush(stderr);

    const size_t pixeles = static_cast<size_t>(ancho) * static_cast<size_t>(alto);
    std::vector<uint8_t> entrada(pixeles * 4);
    std::vector<uint8_t> salida(pixeles * 3);

    for (;;)
    {
        size_t leido = 0;
        while (leido < entrada.size())
        {
            const size_t n = std::fread(entrada.data() + leido, 1, entrada.size() - leido, stdin);
            if (n == 0)
            {
                // RolCam cerró la entrada: se apaga la cámara.
                scDeleteCamera(camara);
                return 0;
            }
            leido += n;
        }
        // RGBA -> BGR (el formato que espera Softcam).
        const uint8_t* e = entrada.data();
        uint8_t* s = salida.data();
        for (size_t i = 0; i < pixeles; ++i, e += 4, s += 3)
        {
            s[0] = e[2];
            s[1] = e[1];
            s[2] = e[0];
        }
        scSendFrame(camara, salida.data());
    }
}
