import { BadRequestException, Injectable } from '@nestjs/common';
import { SourceSystem } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CryptoService } from '@/common/crypto/crypto.service';
import { SourceConnector, SourceCredentials } from './source-connector.interface';
import { IxcConnector } from './providers/ixc.connector';
import { SgpConnector } from './providers/sgp.connector';
import { HubsoftConnector } from './providers/hubsoft.connector';
import { VoalleConnector } from './providers/voalle.connector';
import { MkAuthConnector } from './providers/mkauth.connector';

/**
 * Resolve o conector do sistema de origem configurado pelo tenant.
 * Novos ERPs (SGP, HubSoft, Voalle, MK-Auth) entram aqui.
 */
@Injectable()
export class ConnectorFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async forIntegration(integrationId: string, tenantId?: string): Promise<SourceConnector> {
    // Quando tenantId é informado, escopa a busca (valida posse antes de decifrar credenciais).
    const integ = await this.prisma.sourceIntegration.findFirst({
      where: tenantId ? { id: integrationId, tenantId } : { id: integrationId },
    });
    if (!integ || !integ.ativo) throw new BadRequestException('Integração inválida');
    if (!integ.credentials || !integ.urlBase) {
      throw new BadRequestException('Integração sem credenciais configuradas');
    }
    const creds = this.crypto.decryptJson<SourceCredentials>(integ.credentials);
    creds.urlBase = integ.urlBase;
    return this.build(integ.sistema, creds);
  }

  build(system: SourceSystem, creds: SourceCredentials): SourceConnector {
    switch (system) {
      case 'IXC':
        return new IxcConnector(creds);
      case 'SGP':
        return new SgpConnector(creds);
      case 'HUBSOFT':
        return new HubsoftConnector(creds);
      case 'VOALLE':
        return new VoalleConnector(creds);
      case 'MKAUTH':
        return new MkAuthConnector(creds);
      // CSV e API são tratados por fluxos próprios (upload/webhook), não por conector de pull.
      default:
        throw new BadRequestException(`Conector ${system} ainda não implementado`);
    }
  }
}
