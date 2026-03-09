#!/usr/bin/env ruby
# frozen_string_literal: true

require 'grpc'
require 'tucana'

Tucana.load_protocol(:aquila)

class State
  attr_reader :data_types, :runtime_functions, :flow_types, :action_config_definitions

  def initialize
    @data_types = []
    @runtime_functions = []
    @flow_types = []
    @action_config_definitions = []
  end

  def add_flow_types(flow_types)
    @flow_types += flow_types
  end

  def add_data_types(dts)
    @data_types += dts
  end

  def add_runtime_functions(functions)
    @runtime_functions += functions
  end

  def add_action_config_definition(config)
    @action_config_definitions << config
  end

  def register_config_definitions(token, config_definitions)
    @action_config_definitions.each do |config|
      next unless config[:auth_token] == token

      config[:config_definitions] = config_definitions
      puts "Registered config definitions for action: #{config[:action_identifier]} (v#{config[:version]})"
      break
    end
  end
end

class FlowTypeTransferService < Tucana::Aquila::FlowTypeService::Service
  def initialize(state)
    @state = state
  end

  def update(req, call)
    puts "Got Auth token: #{call.metadata['authorization']}"
    @state.add_flow_types(req.flow_types)

    puts "Flowtypes received: #{req.flow_types.map(&:identifier).join(', ')}"

    Tucana::Aquila::RuntimeFunctionDefinitionUpdateResponse.new(success: true)
  end
end

class RuntimeFunctionDefinitionTransferService < Tucana::Aquila::RuntimeFunctionDefinitionService::Service
  def initialize(state)
    @state = state
  end

  def update(req, call)
    puts "Got Auth token: #{call.metadata['authorization']}"
    @state.add_runtime_functions(req.runtime_functions)

    puts "RuntimeFunctionDefinitions received: #{req.runtime_functions.map(&:runtime_name).join(', ')}"

    Tucana::Aquila::RuntimeFunctionDefinitionUpdateResponse.new(success: true)
  end
end

class DataTypeTransferService < Tucana::Aquila::DataTypeService::Service
  def initialize(state)
    @state = state
  end

  def update(req, call)
    puts "Got Auth token: #{call.metadata['authorization']}"
    @state.add_data_types(req.data_types)
    puts "Data types received: #{req.data_types.map(&:identifier).join(', ')}"
    Tucana::Aquila::DataTypeUpdateResponse.new(success: true)
  end
end

class ActionTransferService < Tucana::Aquila::ActionTransferService::Service
  def initialize(state)
    @state = state
    @sent_configs = []
  end

  def construct_parameters(func)
    struct = Tucana::Shared::Struct.new

    func.runtime_parameter_definitions.each do |param_def|
      struct.fields[param_def.runtime_name] = param_def.default_value
    end

    struct
  end

  def transfer(requests, call)
    token = call.metadata['authorization']
    puts "Got Auth token: #{token}"
    Enumerator.new do |yielder|
      Thread.new do
        loop do
          sleep 5
          @state.action_config_definitions.each do |config|
            next if @sent_configs.include?(config[:identifier])

            puts "Received action config definition: #{config[:action_identifier]} (v#{config[:version]})"
            count = Random.rand(1..5)
            puts "Creating #{count} mock project config"
            proj_conf = []

            count.times do |i|
              proj_conf << Tucana::Shared::ActionProjectConfiguration.new(
                project_id: Random.rand(1..1000),
                action_configurations: [
                  Tucana::Shared::ActionConfiguration.new(
                    identifier: config[:identifier],
                    value: Tucana::Shared::Value.from_ruby("test value for project: #{i}")
                  )
                ]
              )
            end

            yielder << Tucana::Aquila::TransferResponse.new(
              {
                action_configurations:
                  Tucana::Shared::ActionConfigurations.new(action_configurations: proj_conf),
              }
            )
            @sent_configs << config[:identifier]
          end
          @state.runtime_functions.each do |func|
            puts "Sending execute request for: #{func.runtime_name}"
            exec_identifier = "exec_#{func.runtime_name}_#{Time.now.to_i}"
            puts "Execution identifier: #{exec_identifier}"
            yielder << Tucana::Aquila::TransferResponse.new(
              {
                execution: Tucana::Aquila::ExecutionRequest.new(
                  execution_identifier: exec_identifier,
                  function_identifier: func.runtime_name,
                  parameters: construct_parameters(func)
                ),
              }
            )
          end
        end
      end

      requests.each do |req|
        p req
        unless req.result.nil?
          puts "Received execution result for: #{req.result.execution_identifier}"
          puts "Result value: #{req.result.result}"
          next
        end

        unless req.event.nil?
          puts "Received event: #{req.event.event_type}"
          puts "Event data: #{req.event.payload}"
          puts "Project id: #{req.event.project_id}"
          next
        end

        unless req.action_configuration.nil?
          @state.register_config_definitions(token,
                                             req.action_configuration.action_configurations)
        end

        next if req.logon.nil?

        logon = req.logon

        @state.add_action_config_definition({
                                              auth_token: token,
                                              action_identifier: logon.action_identifier,
                                              version: logon.version,
                                              config_definitions: [],
                                            })

        puts "Action logon received: #{logon.action_identifier} (v#{logon.version})"
      end
    end
  end
end

state = State.new

server = GRPC::RpcServer.new
server.add_http2_port('0.0.0.0:50051', :this_port_is_insecure)
server.handle(ActionTransferService.new(state))
server.handle(DataTypeTransferService.new(state))
server.handle(RuntimeFunctionDefinitionTransferService.new(state))
server.handle(FlowTypeTransferService.new(state))
server.run_till_terminated_or_interrupted(%w[INT TERM QUIT])
