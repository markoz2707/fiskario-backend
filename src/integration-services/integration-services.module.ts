import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiGatewayService } from './services/api-gateway.service';
import { ServiceMeshService } from './services/service-mesh.service';
import { FeatureFlagService } from './services/feature-flag.service';
import { RolloutOrchestrationService } from './services/rollout-orchestration.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ApiGatewayService,
    ServiceMeshService,
    FeatureFlagService,
    RolloutOrchestrationService,
  ],
  exports: [
    ApiGatewayService,
    ServiceMeshService,
    FeatureFlagService,
    RolloutOrchestrationService,
  ],
})
export class IntegrationServicesModule {}